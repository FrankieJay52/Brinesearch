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
  issue97-computer-rollout.sh plan-dark
  issue97-computer-rollout.sh build-pending-dark
  issue97-computer-rollout.sh directions-dark
  issue97-computer-rollout.sh directions-report

The script accepts no database URI, password, token or SQL argument. Configure a
private libpq service and export only its non-secret name as PGSERVICE.

build-pending-dark is a fail-stop SERIAL batch. It never runs county builds in
parallel, never retries a failed county, never activates a graph, and never
changes global cutover.
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

reject_frozen_scope() {
  local state="$1" county="$2"
  case "${state}:${county}" in
    OH:BEL|OH:JEF|OH:NOB) die "BEL/JEF/NOB are frozen; this kit cannot rebuild them" ;;
  esac
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

run_plan_sql() {
  local sql_file="$1"
  shift
  run_sql "${sql_file}" --tuples-only --no-align --field-separator='|' --quiet "$@"
}

inspect_after_error() {
  local state="$1" county="$2" phase="$3"
  printf '%s client returned an error. This is not proof of rollback or success.\n' "${phase}" >&2
  printf 'Inspecting server activity and graph state once; no retry will occur.\n' >&2
  run_logged_sql "status-after-error-${state}-${county}" "${sql_dir}/12-county-status.sql" \
    --set="issue97_state=${state}" --set="issue97_county=${county}" || true
}

build_scope_dark() {
  local state="$1" county="$2" verify_mode="$3"
  validate_scope "${state}" "${county}"
  reject_frozen_scope "${state}" "${county}"

  if ! run_logged_sql "build-${state}-${county}" "${sql_dir}/10-build-county.sql" \
    --set="issue97_state=${state}" --set="issue97_county=${county}"; then
    inspect_after_error "${state}" "${county}" "Build"
    return 1
  fi

  case "${verify_mode}" in
    full)
      if ! run_logged_sql "verify-${state}-${county}" "${sql_dir}/11-verify-county.sql" \
        --set="issue97_state=${state}" --set="issue97_county=${county}"; then
        inspect_after_error "${state}" "${county}" "Full verification"
        return 1
      fi
      ;;
    light)
      if ! run_logged_sql "verify-light-${state}-${county}" "${sql_dir}/15-verify-county-light.sql" \
        --set="issue97_state=${state}" --set="issue97_county=${county}"; then
        inspect_after_error "${state}" "${county}" "Light verification"
        return 1
      fi
      ;;
    *)
      die "unknown verification mode: ${verify_mode}"
      ;;
  esac
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
      reject_frozen_scope "$1" "$2"
      run_sql "${sql_dir}/00-preflight.sql"
      build_scope_dark "$1" "$2" full
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
    plan-dark)
      [[ $# -eq 0 ]] || die "plan-dark accepts no arguments"
      run_sql "${sql_dir}/00-preflight.sql"
      run_logged_sql plan-dark "${sql_dir}/14-dark-build-plan.sql"
      ;;
    build-pending-dark)
      [[ $# -eq 0 ]] || die "build-pending-dark accepts no arguments"
      local plan_output
      local -a pending=()
      local scope state county completed total

      run_sql "${sql_dir}/00-preflight.sql"
      if ! plan_output="$(run_plan_sql "${sql_dir}/14-dark-build-plan.sql")"; then
        die "dark-build plan failed; no county build was attempted"
      fi
      mapfile -t pending < <(
        printf '%s\n' "${plan_output}" |
          grep -E '^(OH|WV|PA)\|[A-Z]{3}$' || true
      )

      total=${#pending[@]}
      if [[ "${total}" -eq 0 ]]; then
        printf 'No pending dark county builds. No production write was attempted.\n'
        exit 0
      fi

      printf 'Pending dark-build plan: %s counties. Serial, fail-stop, no activation.\n' "${total}"
      printf '%s\n' "${pending[@]}"
      completed=0

      for scope in "${pending[@]}"; do
        IFS='|' read -r state county <<<"${scope}"
        validate_scope "${state}" "${county}"
        reject_frozen_scope "${state}" "${county}"
        printf '\n[%s/%s] Dark build %s %s\n' "$((completed + 1))" "${total}" "${state}" "${county}"
        build_scope_dark "${state}" "${county}" light
        completed=$((completed + 1))
        printf '[%s/%s] PASS %s %s; build remains inactive.\n' "${completed}" "${total}" "${state}" "${county}"
        if [[ "${completed}" -lt "${total}" ]]; then
          sleep 5
        fi
      done

      printf '\nDark-build batch complete: %s/%s counties built and lightly verified.\n' "${completed}" "${total}"
      printf 'No graph activation, global cutover, route publication, or automatic retry occurred.\n'
      printf 'Stop here for one checkpoint-wide independent read-only audit before activation work.\n'
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
