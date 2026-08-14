-- GitHub #97 — move saved-road release accounting to one reviewed baseline.
--
-- The 2026-08-11 baseline captured 16,109 stable source-kind/occurrence keys.
-- Two later exact Ohio canonical adoptions (Derry Rd and CR-61 / Egger Ridge Rd)
-- legitimately expanded that same inventory to 16,111.  This forward migration
-- does not delete or hide either road.  Instead it updates the independent
-- reviewed baseline and removes duplicated magic occurrence counts from the
-- reconciliation and cutover runtime.

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
);
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:saved-road-reconciliation')
);

-- Fail closed unless this is the exact previously reviewed baseline and exact
-- current saved-road source generation that was independently reconciled inside
-- a rollback-only production transaction on 2026-08-14.
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
  if v_source_digest<>'d28ca2b6fe5cd9610937df0d27362357' then
    raise exception 'Issue #97 saved-road source inventory changed after the reviewed 16,111 reconciliation: %',
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
      'reviewed_by','ChatGPT independent current-production rollback reconciliation',
      'reviewed_at','2026-08-14T15:59:42Z',
      'verification_report_digest','3c739164aff564a337e6d3d69e3d928b',
      'source_digest','d28ca2b6fe5cd9610937df0d27362357',
      'inventory_digest_algorithm','md5 ordered JSONB source_kind + occurrence_key with literal backslash-n separator',
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

-- Verify the exact reviewed singleton and effective runtime definitions.
do $issue97_saved_baseline_verify$
declare
  v_baseline record;
  v_reconcile text;
  v_cutover text;
begin
  select * into strict v_baseline
  from private_verification.brinesearch_issue97_saved_road_release_baseline
  where singleton;
  if v_baseline.expected_occurrence_count<>16111
     or v_baseline.expected_inventory_digest<>'4825b5291ea682af7f659130cd735838'
     or v_baseline.review_details->>'source_digest'<>'d28ca2b6fe5cd9610937df0d27362357'
     or (v_baseline.review_details->>'duplicate_key_groups')::integer<>0 then
    raise exception 'Issue #97 reviewed 16,111 saved-road baseline did not persist exactly';
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
