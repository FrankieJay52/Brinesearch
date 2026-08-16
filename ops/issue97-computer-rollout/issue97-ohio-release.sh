#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/../.." && pwd)"
sql_dir="${script_dir}/sql"
expected_branch="data/issue-97-authoritative-road-junction-graph"
expected_service="brinesearch_issue97_prod"
log_dir="${repo_root}/.issue97-runs"
repo_head=""

die() { printf 'ERROR: %s\n' "$*" >&2; exit 2; }

usage() {
  cat <<'USAGE'
Usage:
  issue97-ohio-release.sh verify-candidate
  issue97-ohio-release.sh persist-manifest
  issue97-ohio-release.sh activate
  issue97-ohio-release.sh verify-activation
  issue97-ohio-release.sh reconcile-dark
  issue97-ohio-release.sh report
  issue97-ohio-release.sh status

Every command is fixed to Ohio and accepts no additional arguments. The lane
accepts no state, county, build ID, SQL, shell command, database URI, password,
token, manifest digest or review JSON. It can never enable global cutover,
publish Google routes, invoke a graph builder, or touch a WV/PA release graph.

persist-manifest, activate, and reconcile-dark are one-attempt, fail-stop writes.
They are authorized only after the required whole-Ohio external audit. On a
client error/disconnect the script performs exactly one fixed read-only status
inspection and never retries the write.
USAGE
}

require_repo_checkpoint() {
  local branch remote_head
  command -v git >/dev/null 2>&1 || die "git is not installed"
  git -C "${repo_root}" fetch --quiet origin "${expected_branch}" ||
    die "failed to recover current origin/${expected_branch}"
  branch="$(git -C "${repo_root}" branch --show-current)"
  [[ "${branch}" == "${expected_branch}" ]] ||
    die "checkout ${expected_branch}; current branch is ${branch:-detached}"
  [[ -z "$(git -C "${repo_root}" status --porcelain --untracked-files=normal)" ]] ||
    die "worktree is not clean"
  repo_head="$(git -C "${repo_root}" rev-parse HEAD)"
  remote_head="$(git -C "${repo_root}" rev-parse "origin/${expected_branch}")"
  [[ "${repo_head}" == "${remote_head}" ]] ||
    die "local HEAD ${repo_head} does not equal current origin head ${remote_head}"
  printf 'Repository checkpoint: %s @ %s\n' "${expected_branch}" "${repo_head}"
}

require_connection_profile() {
  local variable_name
  command -v psql >/dev/null 2>&1 || die "PostgreSQL psql is not installed"
  [[ "${PGSERVICE:-}" == "${expected_service}" ]] ||
    die "set only PGSERVICE=${expected_service}"
  [[ -z "${PGPASSWORD+x}" ]] || die "do not use PGPASSWORD; keep credentials private"
  for variable_name in PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGOPTIONS PGCONNECT_TIMEOUT \
    PGSSLMODE DATABASE_URL SUPABASE_DB_URL SUPABASE_DATABASE_URL; do
    [[ -z "${!variable_name+x}" ]] || die "unset ${variable_name}; use only PGSERVICE"
  done
  export PGAPPNAME="brinesearch-issue97-ohio-release"
}

new_log() {
  local label="$1"
  umask 077
  mkdir -p "${log_dir}"
  printf '%s/%s-%s.log' "${log_dir}" "$(date -u +%Y%m%dT%H%M%SZ)" "${label}"
}

run_sql() {
  local sql_file="$1"; shift
  psql -X --no-psqlrc --set=ON_ERROR_STOP=1 --file="${sql_file}" "$@"
}

mirror_log() {
  local log_file="$1" line
  while IFS= read -r line || [[ -n "${line}" ]]; do
    printf '%s\n' "${line}"
    printf '%s\n' "${line}" >> "${log_file}"
  done
}

run_logged_sql() {
  local label="$1" sql_file="$2"; shift 2
  local log_file rc
  log_file="$(new_log "${label}")"
  : > "${log_file}"
  printf 'Private log: %s\n' "${log_file}"
  set +e
  run_sql "${sql_file}" "$@" 2>&1 | mirror_log "${log_file}"
  rc=${PIPESTATUS[0]}
  set -e
  return "${rc}"
}

inspect_once_after_error() {
  printf 'Write returned an error or ambiguous client result; inspecting current server state exactly once. No retry.\n' >&2
  run_logged_sql ohio-release-status-after-error "${sql_dir}/34-ohio-release-status.sql" || true
}

run_write_once() {
  local label="$1" sql_file="$2"; shift 2
  if ! run_logged_sql "${label}" "${sql_file}" "$@"; then
    inspect_once_after_error
    return 1
  fi
}

main() {
  local command_name="${1:-}"
  [[ -n "${command_name}" ]] || { usage; exit 2; }
  shift
  [[ $# -eq 0 ]] || die "${command_name} accepts no arguments"
  require_repo_checkpoint
  require_connection_profile

  case "${command_name}" in
    verify-candidate)
      run_logged_sql verify-ohio-complete "${sql_dir}/28-verify-ohio-release-complete.sql"
      ;;
    persist-manifest)
      run_write_once persist-ohio-state-manifest "${sql_dir}/29-persist-ohio-state-manifest.sql" \
        --set="issue97_git_sha=${repo_head}"
      ;;
    activate)
      run_write_once activate-ohio-state-manifest "${sql_dir}/30-activate-ohio-state-manifest.sql" \
        --set="issue97_git_sha=${repo_head}"
      ;;
    verify-activation)
      run_logged_sql verify-ohio-state-activation "${sql_dir}/31-verify-ohio-state-activation.sql"
      ;;
    reconcile-dark)
      run_sql "${sql_dir}/31-verify-ohio-state-activation.sql"
      run_write_once reconcile-ohio-dark "${sql_dir}/32-ohio-directions-dark-batch.sql"
      ;;
    report)
      run_sql "${sql_dir}/31-verify-ohio-state-activation.sql"
      run_logged_sql report-ohio-directions "${sql_dir}/33-ohio-directions-report.sql"
      ;;
    status)
      run_logged_sql ohio-release-status "${sql_dir}/34-ohio-release-status.sql"
      ;;
    *) usage; die "unknown command: ${command_name}" ;;
  esac
}

main "$@"
