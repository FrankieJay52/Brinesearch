#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/../.." && pwd)"
expected_branch="data/issue-97-authoritative-road-junction-graph"
log_dir="${repo_root}/.issue97-runs"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 2; }

# CANONICAL FINAL #97 RELEASE REHEARSAL.
# The older issue97-release-rehearsal.sh is retained only as historical evidence
# for the prior 21-file checkpoint. Do not use it for the final release gate.
migration_files=(
  "supabase/migrations/20260814074500_issue97_graph_builder_temp_geography_index.sql"
  "supabase/migrations/20260814160000_issue97_saved_road_release_baseline_current.sql"
  "supabase/migrations/20260814160050_issue97_saved_road_pad_gps_binding.sql"
  "supabase/migrations/20260814161000_issue97_possum_reviewed_subsegment_bridge_registry.sql"
  "supabase/migrations/20260814161100_issue97_possum_reviewed_subsegment_bridge_proof.sql"
  "supabase/migrations/20260814161200_issue97_possum_reviewed_subsegment_bridge_apply.sql"
  "supabase/migrations/20260814161300_issue97_possum_reviewed_subsegment_bridge_runtime.sql"
  "supabase/migrations/20260814161400_issue97_ogrip_endpoint_geography_indexes.sql"
  "supabase/migrations/20260814161500_issue97_ogrip_corroborated_source_vertex.sql"
  "supabase/migrations/20260814162000_issue97_transition_google_schema_acl_hardening.sql"
  "supabase/migrations/20260814163000_issue97_graph_release_generation_registry.sql"
  "supabase/migrations/20260814163050_issue97_odot_authoritative_overlap_shared_pavement.sql"
  "supabase/migrations/20260814163100_issue97_graph_release_current_predicate.sql"
  "supabase/migrations/20260814163200_issue97_ohi_release_qualification.sql"
  "supabase/migrations/20260814163250_issue97_shared_route_right_continuation_context.sql"
  "supabase/migrations/20260814163300_issue97_release_current_consumers.sql"
  "supabase/migrations/20260814163400_issue97_graph_release_input_digests.sql"
  "supabase/migrations/20260814164000_issue97_release_manifests_and_verification_reports.sql"
  "supabase/migrations/20260814164100_issue97_manifest_bound_activation_cutover.sql"
  "supabase/migrations/20260814164200_issue97_post_cutover_report_integrity.sql"
  "supabase/migrations/20260814164250_issue97_database_bound_fixture_receipts.sql"
  "supabase/migrations/20260814164300_issue97_state_scoped_activation_manifests.sql"
)

release_versions=(
  20260814074500 20260814160000 20260814160050 20260814161000 20260814161100
  20260814161200 20260814161300 20260814161400 20260814161500 20260814162000
  20260814163000 20260814163050 20260814163100 20260814163200 20260814163250
  20260814163300 20260814163400 20260814164000 20260814164100 20260814164200
  20260814164250 20260814164300
)

require_repo_checkpoint() {
  local branch local_head remote_head
  branch="$(git -C "${repo_root}" branch --show-current)"
  [[ "${branch}" == "${expected_branch}" ]] || die "checkout ${expected_branch}; current branch is ${branch:-detached}"
  [[ -z "$(git -C "${repo_root}" status --porcelain --untracked-files=normal)" ]] || die "worktree is not clean"
  git -C "${repo_root}" fetch --quiet origin "${expected_branch}"
  local_head="$(git -C "${repo_root}" rev-parse HEAD)"
  remote_head="$(git -C "${repo_root}" rev-parse "origin/${expected_branch}")"
  [[ "${local_head}" == "${remote_head}" ]] || die "local HEAD ${local_head} does not equal fetched origin head ${remote_head}"
  printf 'Repository checkpoint: %s @ %s\n' "${expected_branch}" "${local_head}"
}

require_connection_profile() {
  local variable_name
  command -v psql >/dev/null 2>&1 || die "PostgreSQL psql is not installed"
  [[ -n "${PGSERVICE:-}" ]] || die "set PGSERVICE to the private direct/session libpq service name"
  [[ -z "${PGPASSWORD+x}" ]] || die "do not use PGPASSWORD; keep the password in .pgpass/keychain"
  for variable_name in PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGOPTIONS PGCONNECT_TIMEOUT \
    DATABASE_URL SUPABASE_DB_URL SUPABASE_DATABASE_URL; do
    [[ -z "${!variable_name+x}" ]] || die "unset ${variable_name}; use only PGSERVICE"
  done
  export PGSSLMODE="require"
  export PGAPPNAME="brinesearch-issue97-final-release-rehearsal"
}

verify_files() {
  local file previous=""
  [[ "${#migration_files[@]}" -eq 22 ]] || die "expected exactly 22 final release migrations"
  [[ "${#release_versions[@]}" -eq 22 ]] || die "expected exactly 22 final release migration versions"
  [[ "${migration_files[1]}" == *"20260814160000_issue97_saved_road_release_baseline_current.sql" ]] || die "16,111 baseline must be migration 2"
  [[ "${migration_files[2]}" == *"20260814160050_issue97_saved_road_pad_gps_binding.sql" ]] || die "GPS binding must immediately follow the 16,111 baseline"
  for file in "${migration_files[@]}"; do
    [[ -f "${repo_root}/${file}" ]] || die "missing migration file ${file}"
    if [[ -n "${previous}" && "${file}" < "${previous}" ]]; then
      die "migration list is not lexicographically ordered: ${previous} then ${file}"
    fi
    previous="${file}"
  done
}

run_psql() {
  psql -X --no-psqlrc --set=ON_ERROR_STOP=1 "$@"
}

version_sql_list="$(printf "'%s'," "${release_versions[@]}")"
version_sql_list="${version_sql_list%,}"

snapshot_sql="$(cat <<SQL
select pg_catalog.jsonb_build_object(
  'builder_md5',pg_catalog.md5(pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  )),
  'saved_source_md5',pg_catalog.md5(pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_saved_road_source_digest()'::pg_catalog.regprocedure
  )),
  'saved_source_digest',private_verification.brinesearch_issue97_saved_road_source_digest(),
  'saved_baseline',(select pg_catalog.to_jsonb(b) from private_verification.brinesearch_issue97_saved_road_release_baseline b where singleton),
  'saved_reconciliation_run_count',(select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs),
  'cutover_active',public.brinesearch_issue97_cutover_active(),
  'build_count',(select count(*) from public.brinesearch_road_graph_builds),
  'staging_count',(select count(*) from public.brinesearch_road_graph_builds where status='staging'),
  'builder_sessions',(select count(*) from pg_catalog.pg_stat_activity activity
    where activity.pid<>pg_catalog.pg_backend_pid()
      and activity.state in ('active','idle in transaction','idle in transaction (aborted)')
      and activity.query ilike '%brinesearch_issue97_rebuild_county_graph%'),
  'build_state_digest',(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    b.id::text||':'||b.state_code||':'||b.county_code||':'||b.status||':'||
    coalesce(b.activated_at::text,'')||':'||coalesce(b.graph_digest,'')||':'||
    coalesce(b.source_revision_digest,'')||':'||b.details::text,
    '|' order by b.id
  ),'')) from public.brinesearch_road_graph_builds b),
  'junction_count',(select count(*) from public.brinesearch_road_junctions),
  'anchor_count',(select count(*) from public.brinesearch_road_junction_anchors),
  'membership_count',(select count(*) from public.brinesearch_road_junction_memberships),
  'release_state',(select pg_catalog.to_jsonb(s) from public.brinesearch_issue97_release_state s where singleton),
  'google_receipt_count',(select count(*) from private_verification.brinesearch_google_route_receipts_issue97),
  'public_google_count',(select count(*) from public.brinesearch_driver_google_routes_public),
  'schema_migration_digest',(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    version||':'||coalesce(name,''),'|' order by version
  ),'')) from supabase_migrations.schema_migrations),
  'final_release_versions_installed',(select count(*) from supabase_migrations.schema_migrations
    where version in (${version_sql_list})),
  'oh_source_current',(select count(*) from public.brinesearch_road_source_dataset_counties scope
    join public.brinesearch_road_source_datasets dataset on dataset.id=scope.dataset_id
    where scope.active and scope.ingest_enabled and scope.required_for_graph and dataset.active
      and scope.state_code='OH'
      and private_verification.brinesearch_issue97_dataset_scope_current(
        scope.dataset_id,scope.state_code,scope.county_code
      ))
)::text;
SQL
)"

preflight_sql="$(cat <<SQL
do \$gate\$
declare v_required integer; v_current integer;
begin
  if public.brinesearch_issue97_cutover_active() then
    raise exception 'Issue #97 final release rehearsal requires cutover OFF';
  end if;
  if exists(select 1 from public.brinesearch_road_graph_builds where status='staging') then
    raise exception 'Issue #97 final release rehearsal refuses a staging graph';
  end if;
  if exists(select 1 from pg_catalog.pg_stat_activity activity
      where activity.pid<>pg_catalog.pg_backend_pid()
        and activity.state in ('active','idle in transaction','idle in transaction (aborted)')
        and activity.query ilike '%brinesearch_issue97_rebuild_county_graph%') then
    raise exception 'Issue #97 final release rehearsal refuses an active graph builder';
  end if;
  if pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
     ))<>'c5d54a4d839df79eff99f4dfd4b0b780' then
    raise exception 'Issue #97 predecessor builder changed before final rehearsal';
  end if;
  if pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_issue97_saved_road_source_digest()'::pg_catalog.regprocedure
     ))<>'d3c545529f508f5f4ee8876ee1807ce4' then
    raise exception 'Issue #97 predecessor saved-road source digest function changed before final rehearsal';
  end if;
  if (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)<>0 then
    raise exception 'Issue #97 final rehearsal requires zero saved-road reconciliation runs';
  end if;
  select count(*)::integer,
    count(*) filter(where private_verification.brinesearch_issue97_dataset_scope_current(
      scope.dataset_id,scope.state_code,scope.county_code
    ))::integer
  into v_required,v_current
  from public.brinesearch_road_source_dataset_counties scope
  join public.brinesearch_road_source_datasets dataset on dataset.id=scope.dataset_id
  where scope.active and scope.ingest_enabled and scope.required_for_graph and dataset.active
    and scope.state_code='OH';
  if v_required<>38 or v_current<>38 then
    raise exception 'Issue #97 final rehearsal requires Ohio 38/38 source-current; found %/%',v_current,v_required;
  end if;
  if (select count(*) from supabase_migrations.schema_migrations where version in (${version_sql_list}))<>0 then
    raise exception 'Issue #97 final rehearsal refuses partially/fully installed release migration chain';
  end if;
end
\$gate\$;
SQL
)"

in_transaction_verify="$(cat <<'SQL'
do $verify$
declare
  v_builder_md5 text;
  v_source_md5 text;
  v_source_digest text;
  v_definition text;
  v_baseline record;
  v_generation integer;
  v_ohi integer;
begin
  v_definition:=pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  );
  v_builder_md5:=pg_catalog.md5(v_definition);
  if v_builder_md5<>'793ed8985252b00d52f46da497484029'
     or v_definition not like '%odot_authoritative_overlap_pairs%'
     or v_definition not like '%PRIMARY_OVERLAP_ID%'
     or v_definition not like '%issue97_persistent_secondary_geometry_unchanged%' then
    raise exception 'Issue #97 final rehearsal builder contract mismatch: %',v_builder_md5;
  end if;

  v_definition:=pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_saved_road_source_digest()'::pg_catalog.regprocedure
  );
  v_source_md5:=pg_catalog.md5(v_definition);
  v_source_digest:=private_verification.brinesearch_issue97_saved_road_source_digest();
  select * into strict v_baseline
  from private_verification.brinesearch_issue97_saved_road_release_baseline
  where singleton;
  if v_source_md5<>'927896ee5fd992bfe18eb21774559101'
     or v_source_digest<>'2ad7b559ddd3394265643abd8a5a01a7'
     or v_definition not like '%pg_catalog.round(p.latitude::numeric, 7)%'
     or v_definition not like '%pg_catalog.round(p.longitude::numeric, 7)%'
     or v_definition like '%p.driver_safety_context::text,p.updated_at::text%'
     or v_baseline.expected_occurrence_count<>16111
     or v_baseline.expected_inventory_digest<>'4825b5291ea682af7f659130cd735838'
     or v_baseline.review_details->>'source_digest'<>'2ad7b559ddd3394265643abd8a5a01a7'
     or v_baseline.review_details->>'source_digest_function_md5'<>'927896ee5fd992bfe18eb21774559101'
     or v_baseline.review_details->>'verification_report_digest'<>'6cb07ec60d0e84fbc3f443721eefa242' then
    raise exception 'Issue #97 final rehearsal GPS-bound saved-road contract mismatch';
  end if;

  v_definition:=pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_transition_google_dependency(uuid)'::pg_catalog.regprocedure
  );
  if v_definition not like '%pg_catalog.round(v_pad.latitude::numeric, 7)::text%'
     or v_definition not like '%pg_catalog.round(v_pad.longitude::numeric, 7)::text%'
     or v_definition not like '%saved_pad_gps%' then
    raise exception 'Issue #97 final rehearsal Google destination GPS binding mismatch';
  end if;

  v_definition:=pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_transition_receipts(uuid)'::pg_catalog.regprocedure
  );
  if v_definition not like '%shared_segment_right_continuation_context%'
     or v_definition not like '%right_context_outside_shared_interval%'
     or v_definition not like '%selection_uses_exact_right_identity%'
     or v_definition not like '%private_verification.brinesearch_issue97_graph_build_release_current(%'
     or v_definition like '%private_verification.brinesearch_issue97_graph_build_sources_current(%' then
    raise exception 'Issue #97 final rehearsal shared-route/release-current transition contract mismatch';
  end if;

  if pg_catalog.to_regclass('public.brinesearch_supp_centerline_oh_active_start_geog_issue97_idx') is null
     or pg_catalog.to_regclass('public.brinesearch_supp_centerline_oh_active_end_geog_issue97_idx') is null then
    raise exception 'Issue #97 final rehearsal OGRIP endpoint geography indexes missing';
  end if;
  if pg_catalog.to_regclass('private_verification.brinesearch_issue97_release_manifests') is null
     or pg_catalog.to_regclass('private_verification.brinesearch_issue97_release_manifest_members') is null
     or pg_catalog.to_regclass('private_verification.brinesearch_issue97_verification_reports') is null
     or pg_catalog.to_regprocedure('private_verification.brinesearch_issue97_current_pinned_fixture_receipts(text)') is null
     or pg_catalog.to_regclass('private_verification.brinesearch_issue97_state_candidate_manifests') is null
     or pg_catalog.to_regclass('private_verification.brinesearch_issue97_state_candidate_manifest_members') is null
     or pg_catalog.to_regprocedure('private_verification.brinesearch_issue97_persist_state_candidate_manifest(text,text,text,jsonb)') is null then
    raise exception 'Issue #97 final rehearsal private release/state evidence infrastructure missing';
  end if;
  if pg_catalog.has_table_privilege(
       'service_role','private_verification.brinesearch_issue97_state_candidate_manifests','SELECT'
     ) or pg_catalog.has_function_privilege(
       'service_role','private_verification.brinesearch_issue97_persist_state_candidate_manifest(text,text,text,jsonb)','EXECUTE'
     ) then
    raise exception 'Issue #97 final rehearsal state activation evidence is exposed to service_role';
  end if;
  if (select count(*) from private_verification.brinesearch_issue97_state_candidate_manifests)<>0 then
    raise exception 'Issue #97 final rehearsal unexpectedly persisted a state candidate manifest';
  end if;

  v_definition:=pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_persist_verification_report(text,uuid,uuid,uuid,uuid,jsonb,jsonb)'::pg_catalog.regprocedure
  );
  if v_definition like '%p_pinned_fixture_results->>key%'
     or v_definition like '%v_required_fixture_keys%'
     or v_definition not like '%caller fixture results were supplied%'
     or v_definition not like '%brinesearch_issue97_current_pinned_fixture_receipts%'
     or v_definition not like '%manifest.git_sha<>p_git_sha%' then
    raise exception 'Issue #97 final rehearsal caller-supplied fixture/report trust path remains';
  end if;

  select count(*)::integer into v_generation
  from private_verification.brinesearch_issue97_graph_release_generations
  where active and generation_key='issue97-release-20260814-r1'
    and builder_definition_md5='793ed8985252b00d52f46da497484029'
    and review_details->>'persistent_odot_geometry_rewritten'='false'
    and review_details->>'name_or_nearest_matching_used'='false'
    and source_content_contract='captured-run-content+authoritative-name+supplemental-map-v2';
  if v_generation<>1 then
    raise exception 'Issue #97 final rehearsal active release generation/ODOT overlap contract missing';
  end if;
  select count(*)::integer into v_ohi
  from public.brinesearch_road_graph_builds b
  where b.state_code='WV' and b.county_code='OHI' and b.status='active'
    and private_verification.brinesearch_issue97_graph_build_release_current(b.id);
  if v_ohi<>1 then
    raise exception 'Issue #97 final rehearsal OHI compatibility qualification failed';
  end if;

  if pg_catalog.has_function_privilege(
       'service_role','public.brinesearch_issue97_activate_cutover_without_google_routes(jsonb)','EXECUTE'
     ) or pg_catalog.has_function_privilege(
       'service_role','public.brinesearch_publish_structured_route_issue97_without_google(uuid,uuid,jsonb,bigint)','EXECUTE'
     ) then
    raise exception 'Issue #97 final rehearsal internal release bypass remains executable';
  end if;
  if not exists(select 1 from pg_catalog.pg_trigger t
      where t.tgrelid='private_verification.brinesearch_issue97_graph_release_generations'::pg_catalog.regclass
        and t.tgname='brinesearch_issue97_graph_release_generation_immutable' and t.tgenabled<>'D') then
    raise exception 'Issue #97 final rehearsal release-generation immutability trigger missing';
  end if;
end
$verify$;
SQL
)"

main() {
  local pre_snapshot post_snapshot sql_file log_file file rehearsal_rc
  require_repo_checkpoint
  require_connection_profile
  verify_files

  run_psql --command="${preflight_sql}" >/dev/null
  pre_snapshot="$(run_psql --tuples-only --no-align --quiet --command="${snapshot_sql}")"
  [[ -n "${pre_snapshot}" ]] || die "failed to capture before snapshot"

  umask 077
  mkdir -p "${log_dir}"
  sql_file="$(mktemp "${TMPDIR:-/tmp}/issue97-final-release-rehearsal.XXXXXX.sql")"
  log_file="${log_dir}/$(date -u +%Y%m%dT%H%M%SZ)-final-release-migration-rollback-rehearsal.log"
  trap 'rm -f "${sql_file}"' EXIT

  {
    printf '\\set ON_ERROR_STOP on\n'
    printf 'begin;\n'
    printf "set local statement_timeout='15min';\n"
    printf "set local lock_timeout='2min';\n"
    for file in "${migration_files[@]}"; do
      printf '\\echo Rehearsing %s\n' "${file}"
      # Git for Windows may materialize tracked SQL as CRLF. Exact migration
      # anchors compare to PostgreSQL LF function definitions, so normalize only
      # end-of-line CR while assembling the private temporary SQL script.
      sed 's/\r$//' "${repo_root}/${file}"
      printf '\n'
    done
    printf '%s\n' "${in_transaction_verify}"
    printf '\\echo FINAL 22-MIGRATION RELEASE CHAIN COMPILED AND VERIFIED INSIDE TRANSACTION\n'
    printf 'rollback;\n'
  } > "${sql_file}"

  printf 'Final rollback rehearsal log: %s\n' "${log_file}"
  set +e
  run_psql --file="${sql_file}" 2>&1 | tee "${log_file}"
  rehearsal_rc=${PIPESTATUS[0]}
  set -e

  # Always inspect production from a fresh connection, even after a SQL error or
  # dropped client. Client success/failure is never proof of rollback state.
  post_snapshot="$(run_psql --tuples-only --no-align --quiet --command="${snapshot_sql}")" ||
    die "rehearsal returned rc=${rehearsal_rc} and fresh after-snapshot could not be captured; do not retry"
  [[ -n "${post_snapshot}" ]] || die "failed to capture fresh after snapshot; do not retry"
  if [[ "${pre_snapshot}" != "${post_snapshot}" ]]; then
    printf 'BEFORE: %s\nAFTER:  %s\n' "${pre_snapshot}" "${post_snapshot}" >&2
    die "production snapshot changed across final rollback rehearsal; do not retry"
  fi
  if [[ "${rehearsal_rc}" -ne 0 ]]; then
    die "final release rollback rehearsal returned rc=${rehearsal_rc}; fresh production snapshot is unchanged, but the rehearsal failed and must not be retried without root-cause review"
  fi

  printf 'PASS: all 22 final #97 release migrations compiled/verified in one transaction, GPS-bound saved-road currentness passed, ROLLBACK completed, and fresh production after-snapshot is byte-for-byte unchanged.\n'
}

main "$@"