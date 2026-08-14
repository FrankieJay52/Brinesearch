-- GitHub #97 — post-cutover integrity for the immutable pre-cutover report.
-- Pre-cutover currentness intentionally includes the cutover-OFF Phase 1 gate.
-- After the switch, verify the same immutable report/manifests without pretending
-- that the pre-cutover Phase 1 JSON should equal the post-cutover state.

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
);

create or replace function private_verification.brinesearch_issue97_verification_report_integrity(
  p_report_digest text
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_report record;
  v_baseline record;
  v_reconcile record;
  v_child jsonb;
  v_migration_digest text;
  v_candidate_count integer;
  v_eligible integer;
begin
  select * into v_report
  from private_verification.brinesearch_issue97_verification_reports
  where report_digest=p_report_digest;
  if not found
     or v_report.report_digest<>pg_catalog.md5(v_report.report_body::text)
     or v_report.generation_key is distinct from
       private_verification.brinesearch_issue97_active_graph_release_generation() then
    return false;
  end if;

  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    version||':'||coalesce(name,''),'|' order by version
  ),'')) into v_migration_digest
  from supabase_migrations.schema_migrations;
  if v_report.migration_set_digest is distinct from v_migration_digest then return false; end if;

  if not private_verification.brinesearch_issue97_candidate_manifest_activation_current(
       v_report.candidate_graph_manifest_id
     )
     or not private_verification.brinesearch_issue97_release_manifest_matches_live(
       v_report.active_county_manifest_id
     )
     or not private_verification.brinesearch_issue97_release_manifest_matches_live(
       v_report.source_scope_manifest_id
     )
     or not private_verification.brinesearch_issue97_release_manifest_matches_live(
       v_report.route_eligibility_manifest_id
     ) then
    return false;
  end if;

  select member_count into v_candidate_count
  from private_verification.brinesearch_issue97_release_manifests
  where id=v_report.candidate_graph_manifest_id;
  if v_candidate_count<>38 then return false; end if;

  select * into strict v_baseline
  from private_verification.brinesearch_issue97_saved_road_release_baseline where singleton;
  select * into v_reconcile
  from private_verification.brinesearch_issue97_saved_road_reconciliation_runs
  where id=v_report.saved_road_reconciliation_run_id and status='complete';
  if not found
     or v_reconcile.source_digest<>private_verification.brinesearch_issue97_saved_road_source_digest() then
    return false;
  end if;
  v_child:=private_verification.brinesearch_issue97_saved_road_child_receipt(v_reconcile.id);
  if (v_child->>'occurrence_count')::integer<>v_baseline.expected_occurrence_count
     or v_child->>'inventory_digest'<>v_baseline.expected_inventory_digest
     or (v_child->>'route_critical_held_count')::integer<>0
     or (v_child->>'forbidden_resolution_count')::integer<>0 then
    return false;
  end if;

  select member_count into v_eligible
  from private_verification.brinesearch_issue97_release_manifests
  where id=v_report.route_eligibility_manifest_id;
  if (v_report.route_materialization_receipt->>'complete')::boolean is not true
     or (v_report.route_materialization_receipt->>'eligible_total')::integer<>v_eligible
     or (v_report.route_materialization_receipt->>'materialized_total')::integer+
        (v_report.route_materialization_receipt->>'explicit_held_total')::integer<>v_eligible
     or (v_report.route_materialization_receipt->>'critical_hold_total')::integer<>0
     or (v_report.route_materialization_receipt->>'forbidden_resolution_count')::integer<>0
     or coalesce((v_report.route_materialization_receipt->'phase1_gate'->>'pass')::boolean,false) is not true
     or (v_report.google_accounting_contract->>'eligible_total')::integer<>v_eligible
     or coalesce((v_report.google_accounting_contract->>'stale_allowed')::boolean,true) then
    return false;
  end if;

  if exists(select 1 from unnest(array[
      'thrush','bellaire','leonard','cr26','possum',
      'cologie','repeated_road','shared_segment','long_chunk','parallel_shortcut'
    ]) key where coalesce((v_report.pinned_fixture_results->>key)::boolean,false) is not true) then
    return false;
  end if;
  return true;
end
$$;
revoke all on function private_verification.brinesearch_issue97_verification_report_integrity(text)
from public,anon,authenticated,service_role;

-- Once the reviewed generation has been fully installed (including complete
-- input digests), its definition is a release receipt and is immutable too.
create trigger brinesearch_issue97_graph_release_generation_immutable
before update or delete on private_verification.brinesearch_issue97_graph_release_generations
for each row execute function private_verification.brinesearch_issue97_reject_release_receipt_mutation();

do $issue97_report_integrity_contract$
begin
  if pg_catalog.has_function_privilege(
      'service_role','private_verification.brinesearch_issue97_verification_report_integrity(text)','EXECUTE'
    ) then
    raise exception 'Issue #97 post-cutover report integrity helper is exposed to service_role';
  end if;
  if not exists(select 1 from pg_catalog.pg_trigger trigger
      where trigger.tgrelid='private_verification.brinesearch_issue97_graph_release_generations'::pg_catalog.regclass
        and trigger.tgname='brinesearch_issue97_graph_release_generation_immutable'
        and trigger.tgenabled<>'D') then
    raise exception 'Issue #97 release generation immutability trigger is missing';
  end if;
end
$issue97_report_integrity_contract$;
