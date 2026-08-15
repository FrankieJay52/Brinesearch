-- GitHub #97 — move saved-road release accounting to one reviewed baseline.
--
-- The 2026-08-11 baseline captured 16,109 stable source-kind/occurrence keys.
-- Two later exact Ohio canonical adoptions (Derry Rd and CR-61 / Egger Ridge Rd)
-- legitimately expanded that same inventory to 16,111.  This forward migration
-- does not delete or hide either road.  Instead it updates the independent
-- reviewed baseline and removes duplicated magic occurrence counts from the
-- reconciliation and cutover runtime.
--
-- The earlier source digest also included pads.updated_at even though that
-- timestamp changes for unrelated field-sign, well, address, and audit metadata.
-- Four independently reviewed 2026-08-14 pad metadata updates changed only that
-- timestamp-sensitive digest while every route-bearing pad field and the exact
-- 16,111-key inventory stayed unchanged.  This migration first narrows the pad
-- token to the five route-semantic fields before binding the reviewed baseline.

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
);
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:saved-road-reconciliation')
);

-- Exact, metadata-preserving patch: pads.updated_at is global pad metadata, not
-- saved-road route content.  All route-bearing pad fields remain in the digest.
do $issue97_saved_source_semantic_runtime$
declare
  v_definition text;
  v_patched text;
  v_effective_definition text;
  v_old text;
  v_new text;
  v_owner oid;
  v_acl pg_catalog.aclitem[];
  v_security_definer boolean;
  v_volatility text;
  v_config text[];
  v_effective_owner oid;
  v_effective_acl pg_catalog.aclitem[];
  v_effective_security_definer boolean;
  v_effective_volatility text;
  v_effective_config text[];
begin
  select pg_catalog.pg_get_functiondef(p.oid),p.proowner,p.proacl,p.prosecdef,
         p.provolatile::text,p.proconfig
  into strict v_definition,v_owner,v_acl,v_security_definer,v_volatility,v_config
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private_verification'
    and p.proname='brinesearch_issue97_saved_road_source_digest'
    and p.oid='private_verification.brinesearch_issue97_saved_road_source_digest()'
      ::pg_catalog.regprocedure;

  if pg_catalog.md5(v_definition)<>'d3c545529f508f5f4ee8876ee1807ce4' then
    raise exception 'Issue #97 saved-road source digest definition changed before semantic stabilization';
  end if;

  v_old:=$old$      p.structured_route_steps::text,p.driver_safety_context::text,p.updated_at::text))$old$;
  v_new:=$new$      p.structured_route_steps::text,p.driver_safety_context::text))$new$;
  if (pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
       /pg_catalog.length(v_old)<>1 then
    raise exception 'Issue #97 pad route-semantic source digest anchor changed';
  end if;
  v_patched:=pg_catalog.replace(v_definition,v_old,v_new);

  if pg_catalog.md5(v_patched)<>'ebcacb4b049483fdc48cfcf04dc97dad' then
    raise exception 'Issue #97 semantic saved-road source digest patch is not the reviewed definition';
  end if;

  execute v_patched;

  select pg_catalog.pg_get_functiondef(p.oid),p.proowner,p.proacl,p.prosecdef,
         p.provolatile::text,p.proconfig
  into strict v_effective_definition,v_effective_owner,v_effective_acl,
       v_effective_security_definer,v_effective_volatility,v_effective_config
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private_verification'
    and p.proname='brinesearch_issue97_saved_road_source_digest'
    and p.oid='private_verification.brinesearch_issue97_saved_road_source_digest()'
      ::pg_catalog.regprocedure;

  if pg_catalog.md5(v_effective_definition)<>'ebcacb4b049483fdc48cfcf04dc97dad'
     or v_effective_owner is distinct from v_owner
     or v_effective_acl is distinct from v_acl
     or v_effective_security_definer is distinct from v_security_definer
     or v_effective_volatility is distinct from v_volatility
     or v_effective_config is distinct from v_config
     or v_effective_definition not like
       '%p.structured_road_sequence,p.written_directions,p.directions_clear,%'
     or v_effective_definition not like
       '%p.structured_route_steps::text,p.driver_safety_context::text))%'
     or v_effective_definition like
       '%p.driver_safety_context::text,p.updated_at::text%' then
    raise exception 'Issue #97 semantic saved-road source digest did not install exactly';
  end if;
end
$issue97_saved_source_semantic_runtime$;

-- Fail closed unless this is the exact previously reviewed baseline and exact
-- route-semantic saved-road source generation independently recounted against
-- current production on 2026-08-15.
do $issue97_saved_baseline_precheck$
declare
  v_baseline record;
  v_source_digest text;
begin
  select * into strict v_baseline
  from private_verification.brinesearch_issue97_saved_road_release_baseline
  where singleton;

  if v_baseline.expected_occurrence_count<>16109
     or v_baseline.expected_inventory_digest<>'9b4e608fc8ec32042a06b5fcba1b34d8' then
    raise exception 'Issue #97 saved-road baseline changed before the 16,111 review migration';
  end if;

  v_source_digest:=private_verification.brinesearch_issue97_saved_road_source_digest();
  if v_source_digest<>'cb49d2f5912019abfefe553337860b61' then
    raise exception 'Issue #97 route-semantic saved-road source inventory changed after independent review: %',
      v_source_digest using errcode='40001';
  end if;

  if (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)<>0 then
    raise exception 'Issue #97 saved-road reconciliation history appeared before baseline migration';
  end if;
end
$issue97_saved_baseline_precheck$;

-- The baseline is deliberately data-driven after this migration. A future
-- inventory change must be reviewed and move this singleton in a new forward
-- migration; runtime code is not allowed to bless its own observed count.
alter table private_verification.brinesearch_issue97_saved_road_release_baseline
  alter column expected_occurrence_count drop default;

alter table private_verification.brinesearch_issue97_saved_road_release_baseline
  drop constraint brinesearch_issue97_saved_road__expected_occurrence_count_check;
alter table private_verification.brinesearch_issue97_saved_road_release_baseline
  add constraint brinesearch_issue97_saved_road__expected_occurrence_count_check
  check(expected_occurrence_count>0);

update private_verification.brinesearch_issue97_saved_road_release_baseline
set expected_occurrence_count=16111,
    expected_inventory_digest='4825b5291ea682af7f659130cd735838',
    review_details=pg_catalog.jsonb_build_object(
      'reviewed_by','ChatGPT independent current-production semantic source reconciliation',
      'reviewed_at','2026-08-15T01:18:36Z',
      'verification_report_digest','4668be7f41b420225c0ae7261ac19b71',
      'verification_report',pg_catalog.jsonb_build_object(
        'review','issue97_saved_road_semantic_source_v2',
        'reviewed_at','2026-08-15T01:18:36Z',
        'prior_source_digest','d28ca2b6fe5cd9610937df0d27362357',
        'rehearsal_failure_source_digest','bbac3e7070ad8c491e8d6b9445d80d58',
        'current_timestamp_sensitive_source_digest','e0235aeddf0fa361dd463b7e90c4441a',
        'semantic_source_digest','cb49d2f5912019abfefe553337860b61',
        'occurrence_count',16111,
        'inventory_digest','4825b5291ea682af7f659130cd735838',
        'duplicate_key_groups',0,
        'unchanged_route_semantic_pads',pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'legacy_id','ascent--bannock',
            'digest','2a068b46053c98b9ea85984266ed238c'
          ),
          pg_catalog.jsonb_build_object(
            'legacy_id','ascent--pickens',
            'digest','ffef39b4c9c41fc9d760f174697c39a8'
          ),
          pg_catalog.jsonb_build_object(
            'legacy_id','ascent--robinson',
            'digest','d207127bb05e8df43d4f8fc542ab6bae'
          ),
          pg_catalog.jsonb_build_object(
            'legacy_id','ascent--shutway',
            'digest','dab8a4adefc84e7e41aa759632170093'
          )
        )
      ),
      'source_digest','cb49d2f5912019abfefe553337860b61',
      'source_digest_algorithm','route-semantic-v2: ordered saved-road source tokens; pad token includes structured_road_sequence, written_directions, directions_clear, structured_route_steps, and driver_safety_context; pads.updated_at excluded',
      'source_digest_function_md5','ebcacb4b049483fdc48cfcf04dc97dad',
      'pre_semantic_source_digest_function_md5','d3c545529f508f5f4ee8876ee1807ce4',
      'inventory_digest_algorithm','md5 ordered JSONB source_kind + occurrence_key with newline separator',
      'duplicate_key_groups',0,
      'occurrence_count',16111,
      'exact_count',3077,
      'held_count',13034,
      'route_critical_held_count',38,
      'forbidden_resolution_count',0,
      'source_kind_counts',pg_catalog.jsonb_build_object(
        'canonical_road',404,
        'route_prep_step',4525,
        'published_pad_road',23,
        'route_review_segment',4,
        'direction_step',5468,
        'measured_segment',74,
        'published_route_boundary',15,
        'structured_sequence_container',1068,
        'written_directions_container',1080,
        'clear_directions_container',1065,
        'driver_safety_container',1173,
        'driver_card_input',1065,
        'saved_alias_issue70',147
      ),
      'legitimate_post_baseline_canonical_adoptions',pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'canonical_name','Derry Rd',
          'source_identity_key','OH:ODOT:NLF:THASTR00207**C'
        ),
        pg_catalog.jsonb_build_object(
          'canonical_name','CR-61',
          'alias','Egger Ridge Rd',
          'source_identity_key','OH:ODOT:NLF:CMOECR00061**C'
        )
      )
    ),
    populated_at=pg_catalog.clock_timestamp()
where singleton;

-- A reconciliation run's structural status is independent of one historical
-- baseline count. The runtime below separately compares both count and inventory
-- digest to the reviewed baseline before a run can be accepted.
alter table private_verification.brinesearch_issue97_saved_road_reconciliation_runs
  drop constraint brinesearch_issue97_saved_road_run_status_check;
alter table private_verification.brinesearch_issue97_saved_road_reconciliation_runs
  add constraint brinesearch_issue97_saved_road_run_status_check check(
    (status='building' and inventory_digest is null and result_digest is null
      and occurrence_count=0 and completed_at is null)
    or (status='complete' and inventory_digest is not null and result_digest is not null
      and occurrence_count>0 and completed_at is not null)
    or (status='failed' and completed_at is not null)
  );

-- Patch the reconciliation function at exact current definition.  It must read
-- the baseline before building rows and validate both the count and immutable
-- occurrence-key digest; observing a new inventory can never bless itself.
do $issue97_saved_reconciliation_baseline_runtime$
declare
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_refresh_saved_road_reconciliation()'::pg_catalog.regprocedure
  ) into strict v_definition;

  if pg_catalog.md5(v_definition)<>'89eb2ce602ec0295077e2dc261691cca' then
    raise exception 'Issue #97 saved-road reconciliation definition changed before baseline migration';
  end if;

  v_old:=$old$  v_forbidden integer;
begin$old$;
  v_new:=$new$  v_forbidden integer;
  v_baseline record;
begin$new$;
  if (pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
       /pg_catalog.length(v_old)<>1 then
    raise exception 'Issue #97 saved-road reconciliation declaration anchor changed';
  end if;
  v_patched:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=$old$  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:saved-road-reconciliation')
  );
  v_source_digest:=private_verification.brinesearch_issue97_saved_road_source_digest();$old$;
  v_new:=$new$  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:saved-road-reconciliation')
  );
  select * into strict v_baseline
  from private_verification.brinesearch_issue97_saved_road_release_baseline
  where singleton;
  if v_baseline.expected_occurrence_count<1
     or coalesce(v_baseline.expected_inventory_digest,'')!~'^[0-9a-f]{32}$'
     or nullif(pg_catalog.btrim(v_baseline.review_details->>'reviewed_by'),'') is null
     or nullif(pg_catalog.btrim(v_baseline.review_details->>'reviewed_at'),'') is null
     or nullif(pg_catalog.btrim(v_baseline.review_details->>'verification_report_digest'),'') is null then
    raise exception 'Issue #97 independently reviewed saved-road release baseline is incomplete'
      using errcode='55000';
  end if;
  v_source_digest:=private_verification.brinesearch_issue97_saved_road_source_digest();$new$;
  if (pg_catalog.length(v_patched)-pg_catalog.length(pg_catalog.replace(v_patched,v_old,'')))
       /pg_catalog.length(v_old)<>1 then
    raise exception 'Issue #97 saved-road reconciliation baseline-read anchor changed';
  end if;
  v_patched:=pg_catalog.replace(v_patched,v_old,v_new);

  v_old:=$old$  if v_occurrences<>16109 then
    raise exception 'Issue #97 saved-road reconciliation requires exactly 16,109 occurrences; found %',
      v_occurrences using errcode='55000';
  end if;$old$;
  v_new:=$new$  if v_occurrences<>v_baseline.expected_occurrence_count
     or v_inventory_digest is distinct from v_baseline.expected_inventory_digest then
    raise exception 'Issue #97 saved-road inventory does not match the independently reviewed baseline: count % / %, digest % / %',
      v_occurrences,v_baseline.expected_occurrence_count,
      v_inventory_digest,v_baseline.expected_inventory_digest using errcode='55000';
  end if;$new$;
  if (pg_catalog.length(v_patched)-pg_catalog.length(pg_catalog.replace(v_patched,v_old,'')))
       /pg_catalog.length(v_old)<>1 then
    raise exception 'Issue #97 saved-road reconciliation count guard changed';
  end if;
  v_patched:=pg_catalog.replace(v_patched,v_old,v_new);

  v_old:=$old$      'expected_occurrence_count',16109,$old$;
  v_new:=$new$      'expected_occurrence_count',v_baseline.expected_occurrence_count,
      'expected_inventory_digest',v_baseline.expected_inventory_digest,
      'baseline_populated_at',v_baseline.populated_at,$new$;
  if (pg_catalog.length(v_patched)-pg_catalog.length(pg_catalog.replace(v_patched,v_old,'')))
       /pg_catalog.length(v_old)<>1 then
    raise exception 'Issue #97 saved-road reconciliation metrics anchor changed';
  end if;
  v_patched:=pg_catalog.replace(v_patched,v_old,v_new);

  if v_patched like '%v_occurrences<>16109%'
     or v_patched like '%expected_occurrence_count'',16109%'
     or v_patched like '%16,109 occurrences%' then
    raise exception 'Issue #97 saved-road reconciliation retained a hard-coded obsolete inventory count';
  end if;

  execute v_patched;
end
$issue97_saved_reconciliation_baseline_runtime$;

-- Cutover already derives the immutable child receipt again under lock. Remove
-- its duplicated historical count and require only the reviewed baseline.
do $issue97_cutover_saved_baseline_runtime$
declare
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_activate_cutover_without_google_routes(jsonb)'::pg_catalog.regprocedure
  ) into strict v_definition;
  if pg_catalog.md5(v_definition)<>'7b6d2f4e1cd1066dd696d97ab412929f' then
    raise exception 'Issue #97 cutover implementation changed before saved-road baseline migration';
  end if;
  v_patched:=v_definition;

  v_old:=$old$  -- Count alone cannot prove completeness: an omitted key and an extra key can
  -- cancel out. The baseline digest comes from the independently recounted
  -- current-production 16,109-key manifest and is compared to child rows again
  -- under the cutover locks.$old$;
  v_new:=$new$  -- Count alone cannot prove completeness: an omitted key and an extra key can
  -- cancel out. The independently reviewed baseline count and digest are both
  -- compared to immutable child rows again under the cutover locks.$new$;
  v_patched:=pg_catalog.replace(v_patched,v_old,v_new);

  v_old:=$old$  if not found or v_baseline.expected_occurrence_count<>16109
     or v_baseline.expected_inventory_digest is null then
    raise exception 'Issue #97 independent 16,109-occurrence inventory baseline is not populated'
      using errcode='55000';
  end if;$old$;
  v_new:=$new$  if not found or v_baseline.expected_occurrence_count<1
     or coalesce(v_baseline.expected_inventory_digest,'')!~'^[0-9a-f]{32}$'
     or nullif(pg_catalog.btrim(v_baseline.review_details->>'reviewed_by'),'') is null
     or nullif(pg_catalog.btrim(v_baseline.review_details->>'reviewed_at'),'') is null
     or nullif(pg_catalog.btrim(v_baseline.review_details->>'verification_report_digest'),'') is null then
    raise exception 'Issue #97 independently reviewed saved-road inventory baseline is not populated'
      using errcode='55000';
  end if;$new$;
  if (pg_catalog.length(v_patched)-pg_catalog.length(pg_catalog.replace(v_patched,v_old,'')))
       /pg_catalog.length(v_old)<>1 then
    raise exception 'Issue #97 cutover baseline guard changed';
  end if;
  v_patched:=pg_catalog.replace(v_patched,v_old,v_new);

  v_old:=$old$     or v_child_occurrences<>16109
     or v_child_occurrences<>v_baseline.expected_occurrence_count$old$;
  v_new:=$new2$     or v_child_occurrences<>v_baseline.expected_occurrence_count$new2$;
  if (pg_catalog.length(v_patched)-pg_catalog.length(pg_catalog.replace(v_patched,v_old,'')))
       /pg_catalog.length(v_old)<>1 then
    raise exception 'Issue #97 cutover child-count guard changed';
  end if;
  v_patched:=pg_catalog.replace(v_patched,v_old,v_new);

  v_old:=$old$    raise exception 'Issue #97 cutover requires the exact reviewed 16,109-occurrence inventory, child-derived counters/digests, zero critical holds and zero fuzzy/name-only/nearest resolution'$old$;
  v_new:=$new$    raise exception 'Issue #97 cutover requires the exact independently reviewed saved-road inventory, child-derived counters/digests, zero critical holds and zero fuzzy/name-only/nearest resolution'$new$;
  v_patched:=pg_catalog.replace(v_patched,v_old,v_new);

  if v_patched like '%expected_occurrence_count<>16109%'
     or v_patched like '%v_child_occurrences<>16109%'
     or v_patched like '%16,109-occurrence%' then
    raise exception 'Issue #97 cutover retained a hard-coded obsolete inventory count';
  end if;

  execute v_patched;
end
$issue97_cutover_saved_baseline_runtime$;

-- Verify the exact reviewed singleton, semantic source digest and effective
-- runtime definitions.
do $issue97_saved_baseline_verify$
declare
  v_baseline record;
  v_reconcile text;
  v_cutover text;
  v_source_definition text;
  v_source_digest text;
begin
  select * into strict v_baseline
  from private_verification.brinesearch_issue97_saved_road_release_baseline
  where singleton;
  if v_baseline.expected_occurrence_count<>16111
     or v_baseline.expected_inventory_digest<>'4825b5291ea682af7f659130cd735838'
     or v_baseline.review_details->>'source_digest'<>'cb49d2f5912019abfefe553337860b61'
     or v_baseline.review_details->>'verification_report_digest'<>'4668be7f41b420225c0ae7261ac19b71'
     or pg_catalog.md5((v_baseline.review_details->'verification_report')::text)
          <>'4668be7f41b420225c0ae7261ac19b71'
     or (v_baseline.review_details->>'duplicate_key_groups')::integer<>0 then
    raise exception 'Issue #97 reviewed 16,111 semantic saved-road baseline did not persist exactly';
  end if;

  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_saved_road_source_digest()'
      ::pg_catalog.regprocedure
  ) into strict v_source_definition;
  v_source_digest:=private_verification.brinesearch_issue97_saved_road_source_digest();
  if pg_catalog.md5(v_source_definition)<>'ebcacb4b049483fdc48cfcf04dc97dad'
     or v_source_digest<>'cb49d2f5912019abfefe553337860b61'
     or v_source_definition not like
       '%p.structured_route_steps::text,p.driver_safety_context::text))%'
     or v_source_definition like
       '%p.driver_safety_context::text,p.updated_at::text%' then
    raise exception 'Issue #97 route-semantic saved-road source digest verification failed';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_refresh_saved_road_reconciliation()'::pg_catalog.regprocedure
  ) into strict v_reconcile;
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_activate_cutover_without_google_routes(jsonb)'::pg_catalog.regprocedure
  ) into strict v_cutover;

  if v_reconcile not like '%v_inventory_digest is distinct from v_baseline.expected_inventory_digest%'
     or v_reconcile not like '%expected_occurrence_count'',v_baseline.expected_occurrence_count%'
     or v_cutover not like '%v_child_occurrences<>v_baseline.expected_occurrence_count%'
     or v_cutover not like '%v_child_inventory_digest is distinct from v_baseline.expected_inventory_digest%'
     or v_reconcile like '%16109%'
     or v_cutover like '%16109%' then
    raise exception 'Issue #97 baseline-driven runtime did not install cleanly';
  end if;
end
$issue97_saved_baseline_verify$;
