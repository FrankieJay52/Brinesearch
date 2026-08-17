#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
installer_library="ops/issue97-computer-rollout/issue97-terminal-private-access-install.sh"
installer_library_blob="a3d80f9d3812b1b11f37b7ea033ac77eaf916e5b"
[[ "$(git -C "${repo_root}" hash-object -- "${installer_library}")" == "${installer_library_blob}" ]] || {
  printf 'ERROR: reviewed installer library drifted\n' >&2
  exit 2
}
# shellcheck source=issue97-terminal-private-access-install.sh
source "${repo_root}/${installer_library}"

migration_file="supabase/migrations/20260817030000_issue97_exact_directional_highway_designation_candidates.sql"
migration_version="20260817030000"
migration_name="issue97_exact_directional_highway_designation_candidates"
migration_blob="c10b729c6299111d31cfab79cbe1c46933441b7b"
migration_md5="8c6455d70694fd91784b60cd164cfadf"
history_tag="issue97_migration_20260817030000"

require_checkpoint() {
  local branch local_head remote_head variable_name
  [[ $# -eq 0 ]] || die "installer accepts no arguments"
  branch="$(git -C "${repo_root}" branch --show-current)"
  [[ "${branch}" == "${expected_branch}" ]] || die "wrong branch ${branch:-detached}"
  [[ -z "$(git -C "${repo_root}" status --porcelain --untracked-files=normal)" ]] ||
    die "worktree is not clean"
  git -C "${repo_root}" fetch --quiet origin "${expected_branch}"
  local_head="$(git -C "${repo_root}" rev-parse HEAD)"
  remote_head="$(git -C "${repo_root}" rev-parse "origin/${expected_branch}")"
  [[ "${local_head}" == "${remote_head}" ]] ||
    die "local HEAD ${local_head} does not equal fetched origin head ${remote_head}"
  current_head="${local_head}"
  attempt_file="${log_dir}/issue97-directional-highway-install.${current_head}.attempted"
  [[ -x "${psql_bin}" ]] || die "reviewed PostgreSQL client is missing"
  [[ "${PGSERVICE:-}" == "brinesearch_issue97_prod" ]] ||
    die "PGSERVICE must be brinesearch_issue97_prod"
  [[ -z "${PGPASSWORD+x}" ]] || die "PGPASSWORD must not be set"
  for variable_name in PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGOPTIONS PGCONNECT_TIMEOUT \
    DATABASE_URL SUPABASE_DB_URL SUPABASE_DATABASE_URL; do
    [[ -z "${!variable_name+x}" ]] || die "${variable_name} must be unset; use PGSERVICE only"
  done
  [[ ! -e "${attempt_file}" ]] || die "the one install attempt was already consumed"
  [[ -f "${repo_root}/${migration_file}" ]] || die "migration is missing"
  [[ "$(git -C "${repo_root}" hash-object -- "${migration_file}")" == "${migration_blob}" ]] ||
    die "migration blob drifted"
  if grep -Fq "\$${history_tag}\$" "${repo_root}/${migration_file}"; then
    die "reserved migration history tag occurs in migration"
  fi
  export PGSSLMODE=require
  export PGAPPNAME=brinesearch-issue97-directional-highway-install-only
  printf 'Repository checkpoint: %s @ %s\n' "${expected_branch}" "${current_head}"
}

guard_sql="$(cat <<'SQL'
do $issue97_directional_install_guard$
declare v_required integer; v_current integer;
begin
  if (select count(*) from supabase_migrations.schema_migrations
      where version='20260817030000')<>0
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::pg_catalog.regprocedure
     ))<>'72c16f75efdb356dc2b6d15c691e944c' then
    raise exception 'Issue #97 directional migration must be absent and candidate definition exact';
  end if;
  if (select count(*) from supabase_migrations.schema_migrations
      where version='20260817020000' and name='issue97_terminal_private_access_path_isolation')<>1
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_issue97_terminal_private_access_destination(uuid)'::pg_catalog.regprocedure
     ))<>'34bdc93597f6da3cad68376ca01906c1' then
    raise exception 'Issue #97 prerequisite terminal-private checkpoint drifted';
  end if;
  if (select count(*) from public.brinesearch_road_graph_builds
      where state_code='OH' and status='active')<>19
     or (select count(distinct activated_at) from public.brinesearch_road_graph_builds
         where state_code='OH' and status='active')<>1
     or (select min(activated_at) from public.brinesearch_road_graph_builds
         where state_code='OH' and status='active')<>
        '2026-08-16 11:08:18.355674+00'::timestamptz
     or exists(select 1 from public.brinesearch_road_graph_builds where status='staging')
     or exists(select 1 from public.brinesearch_road_graph_builds
       where state_code in ('WV','PA')
         and details->>'release_generation_key'='issue97-release-20260815-r2')
     or public.brinesearch_issue97_cutover_active()
     or (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)<>0
     or (select count(*) from public.brinesearch_driver_google_routes_public)<>0 then
    raise exception 'Issue #97 graph/release/publication install pins drifted';
  end if;
  if (select count(*) from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
      join public.brinesearch_route_prep route on route.id=receipt.route_prep_id
      join public.pads pad on pad.id=route.pad_id
      where pad.state='Ohio' and route.active and route.route_group in ('primary','alternate'))<>806
     or (select count(*) from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
         join public.brinesearch_route_prep route on route.id=receipt.route_prep_id
         join public.pads pad on pad.id=route.pad_id
         where pad.state='Ohio' and route.active and route.route_group='primary')<>658
     or (select count(*) from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
         join public.brinesearch_route_prep route on route.id=receipt.route_prep_id
         join public.pads pad on pad.id=route.pad_id
         where pad.state='Ohio' and route.active and route.route_group='alternate')<>148
     or (select count(*) from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
         join public.brinesearch_route_prep route on route.id=receipt.route_prep_id
         join public.pads pad on pad.id=route.pad_id
         where pad.state='Ohio' and route.active and route.route_group='primary'
           and receipt.route_status='route_ready')<>2
     or (select max(receipt.updated_at)
         from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
         join public.brinesearch_route_prep route on route.id=receipt.route_prep_id
         join public.pads pad on pad.id=route.pad_id
         where pad.state='Ohio' and route.active and route.route_group in ('primary','alternate'))<>
        '2026-08-17 06:41:25.563805+00'::timestamptz then
    raise exception 'Issue #97 active Ohio receipt pins drifted';
  end if;
  select count(*)::integer,
    count(*) filter(where private_verification.brinesearch_issue97_dataset_scope_current(
      scope.dataset_id,scope.state_code,scope.county_code))::integer into v_required,v_current
  from public.brinesearch_road_source_dataset_counties scope
  join public.brinesearch_road_source_datasets dataset on dataset.id=scope.dataset_id and dataset.active
  where scope.active and scope.ingest_enabled and scope.required_for_graph and scope.state_code='OH';
  if v_required<>38 or v_current<>38 then
    raise exception 'Issue #97 Ohio source scopes drifted: %/%',v_current,v_required;
  end if;
  if exists(select 1 from pg_catalog.pg_stat_activity activity
    where activity.pid<>pg_catalog.pg_backend_pid()
      and activity.state in ('active','idle in transaction','idle in transaction (aborted)')
      and (activity.application_name like 'brinesearch-issue97-%'
        or activity.query ilike '%brinesearch_issue97_rebuild_county_graph%'
        or activity.query ilike '%brinesearch_issue97_run_all_pad_routing_pipeline_geometry_core%'
        or activity.query ilike '%brinesearch_issue97_refresh_google_routes%'
        or activity.query ilike '%brinesearch_issue97_reconcile_route_corpus%')) then
    raise exception 'Issue #97 active operational backend exists';
  end if;
end
$issue97_directional_install_guard$;
SQL
)"

postflight_sql="$(cat <<'SQL'
do $issue97_directional_install_postflight$
begin
  if (select count(*) from supabase_migrations.schema_migrations
      where version='20260817030000'
        and name='issue97_exact_directional_highway_designation_candidates'
        and cardinality(statements)=1
        and pg_catalog.md5(statements[1])='8c6455d70694fd91784b60cd164cfadf')<>1
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::pg_catalog.regprocedure
     ))<>'0f139df2a01f68722958ff10f1dd6f49' then
    raise exception 'Issue #97 directional installed migration/definition mismatch';
  end if;
  if pg_catalog.has_function_privilege('public',
       'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('anon',
       'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated',
       'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('service_role',
       'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)','EXECUTE')
     or public.brinesearch_issue97_cutover_active()
     or exists(select 1 from public.brinesearch_road_graph_builds where status='staging')
     or (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)<>0
     or (select count(*) from public.brinesearch_driver_google_routes_public)<>0 then
    raise exception 'Issue #97 directional installation ACL/protected-state postflight failed';
  end if;
end
$issue97_directional_install_postflight$;
SQL
)"

status_sql="$(cat <<'SQL'
select pg_catalog.jsonb_build_object(
 'migration_rows',(select count(*) from supabase_migrations.schema_migrations where version='20260817030000'),
 'candidate_md5',pg_catalog.md5(pg_catalog.pg_get_functiondef('private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::pg_catalog.regprocedure)),
 'cutover',public.brinesearch_issue97_cutover_active(),
 'public_google',(select count(*) from public.brinesearch_driver_google_routes_public),
 'staging',(select count(*) from public.brinesearch_road_graph_builds where status='staging'),
 'global_reconciliation',(select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)
)::text;
SQL
)"

main() {
  local before after sql_file log_file rc after_rc start_utc end_utc
  require_checkpoint "$@"
  run_psql --command="begin read only; set local statement_timeout='15min'; set local lock_timeout='2min'; ${guard_sql} rollback;" >/dev/null
  before="$(run_psql --tuples-only --no-align --quiet --command="set statement_timeout='15min'; set lock_timeout='2min'; ${snapshot_sql}")"
  [[ -n "${before}" ]] || die "protected before-snapshot is empty"
  umask 077
  mkdir -p "${log_dir}"
  sql_file="$(mktemp "${TMPDIR:-/tmp}/issue97-directional-install.XXXXXX.sql")"
  log_file="${log_dir}/$(date -u +%Y%m%dT%H%M%SZ)-directional-highway-install.log"
  trap 'if [[ -n "${sql_file:-}" ]]; then rm -f -- "${sql_file}"; fi' EXIT
  render_install_sql >"${sql_file}"
  start_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'INSTALL_START_UTC=%s\nMIGRATION_VERSION=%s\nMIGRATION_NAME=%s\nMIGRATION_GIT_BLOB=%s\nMIGRATION_SQL_MD5=%s\n' \
    "${start_utc}" "${migration_version}" "${migration_name}" "${migration_blob}" "${migration_md5}" >"${log_file}"
  printf 'attempted_at=%s\nsha=%s\nlog=%s\n' "${start_utc}" "${current_head}" "${log_file}" >"${attempt_file}"
  printf 'Directional-highway production installation log: %s\n' "${log_file}"
  set +e
  run_psql --file="${sql_file}" >>"${log_file}" 2>&1
  rc=$?
  set -e
  end_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'INSTALL_END_UTC=%s\nCLIENT_EXIT_CODE=%s\n' "${end_utc}" "${rc}" >>"${log_file}"
  while IFS= read -r line || [[ -n "${line}" ]]; do printf '%s\n' "${line}"; done <"${log_file}"
  if [[ "${rc}" -ne 0 ]]; then
    printf 'Fresh one-shot server status after failed/ambiguous client result (NO RETRY):\n' >&2
    run_psql --tuples-only --no-align --quiet --command="${status_sql}" >&2 || true
    die "directional-highway installer failed; do not retry"
  fi
  set +e
  after="$(run_psql --tuples-only --no-align --quiet --command="set statement_timeout='15min'; set lock_timeout='2min'; ${snapshot_sql}" 2>/dev/null)"
  after_rc=$?
  set -e
  if [[ "${after_rc}" -ne 0 || -z "${after}" || "${after}" != "${before}" ]]; then
    printf 'Fresh one-shot server status after commit ambiguity (NO RETRY):\n' >&2
    run_psql --tuples-only --no-align --quiet --command="${status_sql}" >&2 || true
    die "installation may have committed but protected-state equality was not proven"
  fi
  run_psql --command="begin read only; set local statement_timeout='15min'; set local lock_timeout='2min'; ${postflight_sql} rollback;" >/dev/null ||
    die "committed install failed postflight; do not retry"
  printf 'Protected before/after snapshots match exactly.\n'
  printf 'PASS: exact directional-highway migration installed atomically once; protected route/graph/public state unchanged.\n'
  rm -f -- "${sql_file}"
  trap - EXIT
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
