#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/../.." && pwd)"
expected_branch="data/issue-97-authoritative-road-junction-graph"
log_dir="${repo_root}/.issue97-runs"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 2; }

# CONTROLLED FINAL #97 PRODUCTION INSTALLER.
#
# This installer exists only because the canonical 22-migration rollback
# rehearsal proved the chain but intentionally could not persist it. It applies
# exactly the same 22 files in one PostgreSQL transaction and records each
# migration's version/name/full executed SQL in supabase_migrations.schema_migrations
# inside that same transaction. Any SQL/history failure rolls the whole chain
# back together.
#
# No arbitrary migration, SQL, state/county, build, activation or cutover input
# is accepted.
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
  [[ "${branch}" == "${expected_branch}" ]] ||
    die "checkout ${expected_branch}; current branch is ${branch:-detached}"
  [[ -z "$(git -C "${repo_root}" status --porcelain --untracked-files=normal)" ]] ||
    die "worktree is not clean"
  git -C "${repo_root}" fetch --quiet origin "${expected_branch}"
  local_head="$(git -C "${repo_root}" rev-parse HEAD)"
  remote_head="$(git -C "${repo_root}" rev-parse "origin/${expected_branch}")"
  [[ "${local_head}" == "${remote_head}" ]] ||
    die "local HEAD ${local_head} does not equal fetched origin head ${remote_head}"
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
  export PGAPPNAME="brinesearch-issue97-final-release-install"
}

verify_files() {
  local file previous="" base version name tag
  [[ "${#migration_files[@]}" -eq 22 ]] || die "expected exactly 22 final release migrations"
  [[ "${#release_versions[@]}" -eq 22 ]] || die "expected exactly 22 final release migration versions"
  [[ "${migration_files[1]}" == *"20260814160000_issue97_saved_road_release_baseline_current.sql" ]] ||
    die "16,118 baseline must be migration 2"
  [[ "${migration_files[2]}" == *"20260814160050_issue97_saved_road_pad_gps_binding.sql" ]] ||
    die "GPS binding must immediately follow the 16,118 baseline"
  for file in "${migration_files[@]}"; do
    [[ -f "${repo_root}/${file}" ]] || die "missing migration file ${file}"
    if [[ -n "${previous}" && "${file}" < "${previous}" ]]; then
      die "migration list is not lexicographically ordered: ${previous} then ${file}"
    fi
    previous="${file}"
    base="${file##*/}"
    [[ "${base}" =~ ^([0-9]{14})_([a-z0-9_]+)\.sql$ ]] ||
      die "unexpected migration filename format: ${file}"
    version="${BASH_REMATCH[1]}"
    name="${BASH_REMATCH[2]}"
    tag="issue97_migration_${version}"
    if grep -Fq "\$${tag}\$" "${repo_root}/${file}"; then
      die "migration ${file} contains reserved installer dollar-quote tag"
    fi
    [[ " ${release_versions[*]} " == *" ${version} "* ]] ||
      die "migration ${file} version is outside the exact release allowlist"
    [[ -n "${name}" ]] || die "migration ${file} has an empty history name"
  done
}

run_psql() {
  psql -X --no-psqlrc --set=ON_ERROR_STOP=1 "$@"
}

version_sql_list="$(printf "'%s'," "${release_versions[@]}")"
version_sql_list="${version_sql_list%,}"

protected_snapshot_sql="$(cat <<'SQL'
select pg_catalog.jsonb_build_object(
  'cutover_active',public.brinesearch_issue97_cutover_active(),
  'build_count',(select count(*) from public.brinesearch_road_graph_builds),
  'active_builds',(select coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'state',b.state_code,'county',b.county_code,'id',b.id
      ) order by b.state_code,b.county_code,b.id
    ),'[]'::jsonb)
    from public.brinesearch_road_graph_builds b where b.status='active'),
  'staging_count',(select count(*) from public.brinesearch_road_graph_builds where status='staging'),
  'junction_count',(select count(*) from public.brinesearch_road_junctions),
  'anchor_count',(select count(*) from public.brinesearch_road_junction_anchors),
  'membership_count',(select count(*) from public.brinesearch_road_junction_memberships),
  'saved_reconciliation_run_count',(select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs),
  'google_receipt_count',(select count(*) from private_verification.brinesearch_google_route_receipts_issue97),
  'public_google_count',(select count(*) from public.brinesearch_driver_google_routes_public)
)::text;
SQL
)"

preflight_sql="$(cat <<SQL
do \$gate\$
declare
  v_required integer;
  v_current integer;
  v_history_shape integer;
begin
  if public.brinesearch_issue97_cutover_active() then
    raise exception 'Issue #97 final installer requires cutover OFF';
  end if;
  if exists(select 1 from public.brinesearch_road_graph_builds where status='staging') then
    raise exception 'Issue #97 final installer refuses a staging graph';
  end if;
  if exists(select 1 from pg_catalog.pg_stat_activity activity
      where activity.pid<>pg_catalog.pg_backend_pid()
        and activity.state in ('active','idle in transaction','idle in transaction (aborted)')
        and (activity.query ilike '%brinesearch_issue97_rebuild_county_graph%'
          or activity.application_name='brinesearch-issue97-final-release-install')) then
    raise exception 'Issue #97 final installer refuses a concurrent builder/installer session';
  end if;
  if pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
     ))<>'c5d54a4d839df79eff99f4dfd4b0b780' then
    raise exception 'Issue #97 predecessor builder changed before final install';
  end if;
  if pg_catalog.to_regclass('private_verification.brinesearch_issue97_graph_release_generations') is not null then
    raise exception 'Issue #97 final release-generation table already exists before exact install';
  end if;
  if (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)<>0 then
    raise exception 'Issue #97 final installer requires zero saved-road reconciliation runs';
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
    raise exception 'Issue #97 final installer requires Ohio 38/38 source-current; found %/%',v_current,v_required;
  end if;
  if (select count(*) from supabase_migrations.schema_migrations
      where version in (${version_sql_list}))<>0 then
    raise exception 'Issue #97 final installer refuses a partial/already-installed 22-version release chain';
  end if;
  select count(*)::integer into v_history_shape
  from information_schema.columns c
  where c.table_schema='supabase_migrations' and c.table_name='schema_migrations'
    and ((c.column_name='version' and c.data_type='text' and c.is_nullable='NO')
      or (c.column_name='statements' and c.data_type='ARRAY')
      or (c.column_name='name' and c.data_type='text'));
  if v_history_shape<>3 then
    raise exception 'Issue #97 Supabase migration-history table shape changed';
  end if;
end
\$gate\$;
SQL
)"

postflight_sql="$(cat <<SQL
do \$gate\$
declare
  v_required integer;
  v_current integer;
  v_generation integer;
  v_ohi integer;
begin
  if (select count(*) from supabase_migrations.schema_migrations
      where version in (${version_sql_list}))<>22 then
    raise exception 'Issue #97 final installer postflight expected 22/22 migration history rows';
  end if;
  if exists(select 1 from supabase_migrations.schema_migrations
      where version in (${version_sql_list})
        and (cardinality(statements)<>1 or nullif(name,'') is null)) then
    raise exception 'Issue #97 final installer postflight found incomplete migration history evidence';
  end if;
  if pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
     ))<>'e0528f257f3c1b6d40341b735f284f1d' then
    raise exception 'Issue #97 final installer postflight builder fingerprint mismatch';
  end if;
  if pg_catalog.to_regclass('private_verification.brinesearch_issue97_graph_release_generations') is null then
    raise exception 'Issue #97 final installer postflight release-generation table missing';
  end if;
  select count(*)::integer into v_generation
  from private_verification.brinesearch_issue97_graph_release_generations
  where active and generation_key='issue97-release-20260814-r1'
    and builder_definition_md5='e0528f257f3c1b6d40341b735f284f1d';
  if v_generation<>1 then
    raise exception 'Issue #97 final installer postflight release generation is not exact/current';
  end if;
  if public.brinesearch_issue97_cutover_active() then
    raise exception 'Issue #97 final installer postflight found global cutover active';
  end if;
  if exists(select 1 from public.brinesearch_road_graph_builds where status='staging') then
    raise exception 'Issue #97 final installer postflight found staging graph';
  end if;
  if exists(select 1 from pg_catalog.pg_stat_activity activity
      where activity.pid<>pg_catalog.pg_backend_pid()
        and activity.state in ('active','idle in transaction','idle in transaction (aborted)')
        and (activity.query ilike '%brinesearch_issue97_rebuild_county_graph%'
          or activity.application_name='brinesearch-issue97-final-release-install')) then
    raise exception 'Issue #97 final installer postflight found concurrent builder/installer session';
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
    raise exception 'Issue #97 final installer postflight requires Ohio 38/38 source-current; found %/%',v_current,v_required;
  end if;
  if (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)<>0 then
    raise exception 'Issue #97 final installer unexpectedly started saved-road reconciliation';
  end if;
  select count(*)::integer into v_ohi
  from public.brinesearch_road_graph_builds b
  where b.state_code='WV' and b.county_code='OHI' and b.status='active'
    and private_verification.brinesearch_issue97_graph_build_release_current(b.id);
  if v_ohi<>1 then
    raise exception 'Issue #97 final installer postflight OHI compatibility qualification failed';
  end if;
end
\$gate\$;
SQL
)"

status_after_error_sql="$(cat <<SQL
select pg_catalog.jsonb_build_object(
  'builder_md5',pg_catalog.md5(pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  )),
  'release_versions_installed',(select count(*) from supabase_migrations.schema_migrations
    where version in (${version_sql_list})),
  'cutover_active',public.brinesearch_issue97_cutover_active(),
  'staging_count',(select count(*) from public.brinesearch_road_graph_builds where status='staging'),
  'builder_sessions',(select count(*) from pg_catalog.pg_stat_activity activity
    where activity.pid<>pg_catalog.pg_backend_pid()
      and activity.state in ('active','idle in transaction','idle in transaction (aborted)')
      and activity.query ilike '%brinesearch_issue97_rebuild_county_graph%'),
  'installer_sessions',(select count(*) from pg_catalog.pg_stat_activity activity
    where activity.pid<>pg_catalog.pg_backend_pid()
      and activity.state in ('active','idle in transaction','idle in transaction (aborted)')
      and activity.application_name='brinesearch-issue97-final-release-install')
)::text;
SQL
)"

main() {
  local protected_before protected_after sql_file log_file file base version name tag install_rc

  [[ $# -eq 0 ]] || die "final production installer accepts no arguments"
  require_repo_checkpoint
  require_connection_profile
  verify_files

  run_psql --command="${preflight_sql}" >/dev/null
  protected_before="$(run_psql --tuples-only --no-align --quiet --command="${protected_snapshot_sql}")"
  [[ -n "${protected_before}" ]] || die "failed to capture protected before snapshot"

  umask 077
  mkdir -p "${log_dir}"
  sql_file="$(mktemp "${TMPDIR:-/tmp}/issue97-final-release-install.XXXXXX.sql")"
  log_file="${log_dir}/$(date -u +%Y%m%dT%H%M%SZ)-final-release-install.log"
  trap 'if [[ -n "${sql_file:-}" ]]; then rm -f -- "${sql_file}"; fi' EXIT

  {
    printf '\\set ON_ERROR_STOP on\n'
    printf 'begin;\n'
    printf "set local statement_timeout='15min';\n"
    printf "set local lock_timeout='2min';\n"
    printf 'create temporary table issue97_final_install_before on commit drop as select 1 as marker;\n'

    for file in "${migration_files[@]}"; do
      base="${file##*/}"
      [[ "${base}" =~ ^([0-9]{14})_([a-z0-9_]+)\.sql$ ]] ||
        die "unexpected migration filename format while assembling installer: ${file}"
      version="${BASH_REMATCH[1]}"
      name="${BASH_REMATCH[2]}"
      tag="issue97_migration_${version}"

      printf '\\echo Installing %s\n' "${file}"
      # Match the successfully rehearsed execution bytes on Git for Windows by
      # stripping only end-of-line CR while assembling this private SQL file.
      sed 's/\r$//' "${repo_root}/${file}"
      printf '\n'

      # Record the exact normalized SQL that was just executed. This history row
      # is in the same transaction as the migration itself; it can never claim a
      # migration was applied if the surrounding transaction rolls back.
      printf "insert into supabase_migrations.schema_migrations(version,statements,name) values ('%s',ARRAY[\$%s\$" \
        "${version}" "${tag}"
      sed 's/\r$//' "${repo_root}/${file}"
      printf "\$%s\$]::text[],'%s');\n" "${tag}" "${name}"
    done

    printf "do \\\$verify\\\$ declare v_generation integer; begin\n"
    printf "  if (select count(*) from supabase_migrations.schema_migrations where version in (%s))<>22 then raise exception 'Issue #97 exact installer did not record 22/22 migration rows'; end if;\n" "${version_sql_list}"
    printf "  if pg_catalog.md5(pg_catalog.pg_get_functiondef('public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure))<>'e0528f257f3c1b6d40341b735f284f1d' then raise exception 'Issue #97 exact installer builder fingerprint mismatch'; end if;\n"
    printf "  select count(*)::integer into v_generation from private_verification.brinesearch_issue97_graph_release_generations where active and generation_key='issue97-release-20260814-r1' and builder_definition_md5='e0528f257f3c1b6d40341b735f284f1d';\n"
    printf "  if v_generation<>1 then raise exception 'Issue #97 exact installer release generation mismatch'; end if;\n"
    printf "  if public.brinesearch_issue97_cutover_active() or exists(select 1 from public.brinesearch_road_graph_builds where status='staging') then raise exception 'Issue #97 exact installer changed cutover/staging state'; end if;\n"
    printf "  if (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)<>0 then raise exception 'Issue #97 exact installer started reconciliation'; end if;\n"
    printf "end \\\$verify\\\$;\n"
    printf 'commit;\n'
  } > "${sql_file}"

  printf 'Final production install log: %s\n' "${log_file}"
  set +e
  run_psql --file="${sql_file}" 2>&1 | tee "${log_file}"
  install_rc=${PIPESTATUS[0]}
  set -e

  if [[ "${install_rc}" -ne 0 ]]; then
    printf 'Installer client returned rc=%s. This is not proof of rollback or success.\n' "${install_rc}" >&2
    printf 'Fresh one-shot server status (NO RETRY):\n' >&2
    run_psql --tuples-only --no-align --quiet --command="${status_after_error_sql}" >&2 || true
    die "final production installer returned an error; do not retry until the fresh server state is reviewed"
  fi

  # Success from the installing client is still not sufficient. Reconnect and
  # prove the exact intended state from a fresh PostgreSQL session.
  protected_after="$(run_psql --tuples-only --no-align --quiet --command="${protected_snapshot_sql}")" ||
    die "install client returned success but fresh protected after-snapshot could not be captured; do not continue"
  [[ -n "${protected_after}" ]] || die "fresh protected after-snapshot was empty; do not continue"
  if [[ "${protected_before}" != "${protected_after}" ]]; then
    printf 'PROTECTED BEFORE: %s\nPROTECTED AFTER:  %s\n' "${protected_before}" "${protected_after}" >&2
    die "protected graph/route/cutover state changed during final release install; stop before canaries"
  fi

  run_psql --command="${postflight_sql}" >/dev/null ||
    die "final release install committed but fresh postflight failed; stop before canaries"

  rm -f -- "${sql_file}"
  trap - EXIT
  printf 'PASS: exact 22/22 final #97 release migrations installed atomically with matching Supabase migration-history rows; fresh postflight passed; protected graph/route/cutover state is unchanged.\n'
}

main "$@"
