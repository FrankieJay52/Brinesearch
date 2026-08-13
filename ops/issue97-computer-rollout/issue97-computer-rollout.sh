#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/../.." && pwd)"
sql_dir="${script_dir}/sql"
expected_branch="data/issue-97-authoritative-road-junction-graph"
log_dir="${repo_root}/.issue97-runs"

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 2
}

usage() {
  cat <<'USAGE'
Usage:
  issue97-computer-rollout.sh preflight
  issue97-computer-rollout.sh status STATE COUNTY
  issue97-computer-rollout.sh build STATE COUNTY
  issue97-computer-rollout.sh verify STATE COUNTY
  issue97-computer-rollout.sh verify-ohi
  issue97-computer-rollout.sh directions-dark
  issue97-computer-rollout.sh directions-report

The script accepts no database URI, password, token or SQL argument. Configure a
private libpq service and export only its non-secret name as PGSERVICE.
USAGE
}

require_repo_checkpoint() {
  local branch local_head remote_head
  branch="$(git -C "${repo_root}" branch --show-current)"
  [[ "${branch}" == "${expected_branch}" ]] ||
    die "checkout ${expected_branch}; current branch is ${branch:-detached}"
  [[ -z "$(git -C "${repo_root}" status --porcelain --untracked-files=normal)" ]] ||
    die "worktree is not clean"
  local_head="$(git -C "${repo_root}" rev-parse HEAD)"
  remote_head="$(git -C "${repo_root}" rev-parse "origin/${expected_branch}" 2>/dev/null)" ||
    die "origin/${expected_branch} is unavailable; fetch it first"
  [[ "${local_head}" == "${remote_head}" ]] ||
    die "local HEAD ${local_head} does not equal fetched origin head ${remote_head}"
  printf 'Repository checkpoint: %s @ %s\n' "${expected_branch}" "${local_head}"
}

require_connection_profile() {
  local variable_name
  command -v psql >/dev/null 2>&1 || die "PostgreSQL psql is not installed"
  [[ -n "${PGSERVICE:-}" ]] ||
    die "set PGSERVICE to a private direct/session libpq service name"
  [[ -z "${PGPASSWORD+x}" ]] ||
    die "do not use PGPASSWORD; keep the password in a private .pgpass/keychain-backed profile"
  for variable_name in PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGOPTIONS PGCONNECT_TIMEOUT \
    DATABASE_URL SUPABASE_DB_URL SUPABASE_DATABASE_URL; do
    [[ -z "${!variable_name+x}" ]] ||
      die "unset ${variable_name}; this kit permits connection settings only through PGSERVICE"
  done
  export PGSSLMODE="require"
  export PGAPPNAME="brinesearch-issue97-computer-rollout"
}

validate_scope() {
  local state="${1:-}" county="${2:-}"
  [[ "${state}" =~ ^(OH|WV|PA)$ ]] || die "STATE must be OH, WV or PA"
  [[ "${county}" =~ ^[A-Z]{3}$ ]] || die "COUNTY must be an exact three-letter registry code"
}

new_log() {
  local label="$1"
  umask 077
  mkdir -p "${log_dir}"
  printf '%s/%s-%s.log' "${log_dir}" "$(date -u +%Y%m%dT%H%M%SZ)" "${label}"
}

run_sql() {
  local sql_file="$1"
  shift
  psql -X --no-psqlrc --set=ON_ERROR_STOP=1 --file="${sql_file}" "$@"
}

run_logged_sql() {
  local label="$1" sql_file="$2"
  shift 2
  local log_file rc
  log_file="$(new_log "${label}")"
  printf 'Log: %s\n' "${log_file}"
  set +e
  run_sql "${sql_file}" "$@" 2>&1 | tee "${log_file}"
  rc=${PIPESTATUS[0]}
  set -e
  return "${rc}"
}

main() {
  local command_name="${1:-}"
  [[ -n "${command_name}" ]] || { usage; exit 2; }
  shift

  require_repo_checkpoint
  require_connection_profile

  case "${command_name}" in
    preflight)
      [[ $# -eq 0 ]] || die "preflight accepts no arguments"
      run_logged_sql preflight "${sql_dir}/00-preflight.sql"
      ;;
    status)
      [[ $# -eq 2 ]] || die "status requires STATE COUNTY"
      validate_scope "$1" "$2"
      run_logged_sql "status-$1-$2" "${sql_dir}/12-county-status.sql" \
        --set="issue97_state=$1" --set="issue97_county=$2"
      ;;
    build)
      [[ $# -eq 2 ]] || die "build requires STATE COUNTY"
      validate_scope "$1" "$2"
      case "$1:$2" in
        OH:BEL|OH:JEF|OH:NOB) die "BEL/JEF/NOB are frozen; this kit cannot rebuild them" ;;
      esac
      run_sql "${sql_dir}/00-preflight.sql"
      if ! run_logged_sql "build-$1-$2" "${sql_dir}/10-build-county.sql" \
        --set="issue97_state=$1" --set="issue97_county=$2"; then
        printf 'Build client returned an error. This is not proof of rollback or success.\n' >&2
        printf 'Inspecting server activity and graph state once; no retry will occur.\n' >&2
        run_logged_sql "status-after-error-$1-$2" "${sql_dir}/12-county-status.sql" \
          --set="issue97_state=$1" --set="issue97_county=$2" || true
        exit 1
      fi
      run_logged_sql "verify-$1-$2" "${sql_dir}/11-verify-county.sql" \
        --set="issue97_state=$1" --set="issue97_county=$2"
      ;;
    verify)
      [[ $# -eq 2 ]] || die "verify requires STATE COUNTY"
      validate_scope "$1" "$2"
      run_logged_sql "verify-$1-$2" "${sql_dir}/11-verify-county.sql" \
        --set="issue97_state=$1" --set="issue97_county=$2"
      ;;
    verify-ohi)
      [[ $# -eq 0 ]] || die "verify-ohi accepts no arguments"
      run_logged_sql verify-WV-OHI-Thrush "${sql_dir}/13-verify-ohi-thrush.sql"
      ;;
    directions-dark)
      [[ $# -eq 0 ]] || die "directions-dark accepts no arguments"
      if ! run_logged_sql directions-dark "${sql_dir}/30-directions-dark-batch.sql"; then
        printf 'Direction client returned an error. This is not proof of rollback or success.\n' >&2
        printf 'Running one fresh read-only report; no retry will occur.\n' >&2
        run_logged_sql directions-report-after-error "${sql_dir}/31-directions-report.sql" || true
        exit 1
      fi
      run_logged_sql directions-report "${sql_dir}/31-directions-report.sql"
      ;;
    directions-report)
      [[ $# -eq 0 ]] || die "directions-report accepts no arguments"
      run_logged_sql directions-report "${sql_dir}/31-directions-report.sql"
      ;;
    *)
      usage
      die "unknown command: ${command_name}"
      ;;
  esac
}

main "$@"
