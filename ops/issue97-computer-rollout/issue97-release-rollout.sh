#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/../.." && pwd)"
sql_dir="${script_dir}/sql"
expected_branch="data/issue-97-authoritative-road-junction-graph"
log_dir="${repo_root}/.issue97-runs"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 2; }

usage() {
  cat <<'USAGE'
Usage:
  issue97-release-rollout.sh preflight
  issue97-release-rollout.sh status STATE COUNTY
  issue97-release-rollout.sh ohio-canary
  issue97-release-rollout.sh plan-ohio-dark
  issue97-release-rollout.sh build-pending-ohio-dark

Current release order is deliberately Ohio first, then West Virginia, then
Pennsylvania. The old mixed-state canaries/plan/batch commands are disabled
while the Ohio phase is active.

This release-generation lane accepts no database URI, password, token, SQL,
build ID or activation input. Configure a private libpq service and export only
PGSERVICE.

ohio-canary runs exactly OH/NOB, once, fail-stop. It never retries, activates a
graph, changes global cutover, publishes routes or starts another state.

build-pending-ohio-dark is permitted only after the Noble canary checkpoint has
been independently audited. It discovers only remaining Ohio release-current
work, runs counties serially, verifies each immediately, stops on the first
failure, never retries, and never activates/cuts over/publishes.
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
  [[ -n "${PGSERVICE:-}" ]] || die "set PGSERVICE to a private direct/session libpq service name"
  [[ -z "${PGPASSWORD+x}" ]] || die "do not use PGPASSWORD; keep the password in .pgpass/keychain"
  for variable_name in PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGOPTIONS PGCONNECT_TIMEOUT \
    DATABASE_URL SUPABASE_DB_URL SUPABASE_DATABASE_URL; do
    [[ -z "${!variable_name+x}" ]] || die "unset ${variable_name}; use only PGSERVICE"
  done
  export PGSSLMODE="require"
  export PGAPPNAME="brinesearch-issue97-release-rollout"
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
  printf 'Log: %s\n' "${log_file}"
  set +e
  run_sql "${sql_file}" "$@" 2>&1 | mirror_log "${log_file}"
  rc=${PIPESTATUS[0]}
  set -e
  return "${rc}"
}

run_plan_sql() {
  local sql_file="$1"; shift
  run_sql "${sql_file}" --tuples-only --no-align --field-separator='|' --quiet "$@"
}

inspect_after_error() {
  local state="$1" county="$2" phase="$3"
  printf '%s returned an error. This is not proof of rollback or success.\n' "${phase}" >&2
  printf 'Inspecting server state once; no retry will occur.\n' >&2
  run_logged_sql "status-after-error-${state}-${county}" "${sql_dir}/12-county-status.sql" \
    --set="issue97_state=${state}" --set="issue97_county=${county}" || true
}

build_release_scope() {
  local state="$1" county="$2" verify_sql="$3" label="$4"
  validate_scope "${state}" "${county}"
  if ! run_logged_sql "build-${label}-${state}-${county}" "${sql_dir}/18-build-county-release.sql" \
    --set="issue97_state=${state}" --set="issue97_county=${county}"; then
    inspect_after_error "${state}" "${county}" "Release dark build"
    return 1
  fi
  if ! run_logged_sql "verify-${label}-${state}-${county}" "${sql_dir}/${verify_sql}" \
    --set="issue97_state=${state}" --set="issue97_county=${county}"; then
    inspect_after_error "${state}" "${county}" "Release verification"
    return 1
  fi
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
      run_logged_sql release-preflight "${sql_dir}/17-release-preflight.sql"
      ;;
    status)
      [[ $# -eq 2 ]] || die "status requires STATE COUNTY"
      validate_scope "$1" "$2"
      run_logged_sql "status-$1-$2" "${sql_dir}/12-county-status.sql" \
        --set="issue97_state=$1" --set="issue97_county=$2"
      ;;
    ohio-canary)
      [[ $# -eq 0 ]] || die "ohio-canary accepts no arguments"
      run_sql "${sql_dir}/17-release-preflight.sql"
      printf 'Ohio canary: OH NOB semantic topology canary. One attempt, no retry.\n'
      build_release_scope OH NOB "21-verify-nob-leonard-release.sql" ohio-canary
      printf 'Ohio canary PASS: OH NOB is validated, release-current, and inactive.\n'
      printf 'STOP: this exact canary checkpoint requires one independent read-only audit before the remaining Ohio batch.\n'
      ;;
    plan-ohio-dark)
      [[ $# -eq 0 ]] || die "plan-ohio-dark accepts no arguments"
      run_sql "${sql_dir}/17-release-preflight.sql"
      run_logged_sql plan-ohio-dark "${sql_dir}/24-ohio-release-dark-plan.sql"
      ;;
    build-pending-ohio-dark)
      [[ $# -eq 0 ]] || die "build-pending-ohio-dark accepts no arguments"
      local plan_output scope state county completed total
      local -a pending=()
      run_sql "${sql_dir}/17-release-preflight.sql"
      run_sql "${sql_dir}/25-ohio-canary-complete-gate.sql"
      if ! plan_output="$(run_plan_sql "${sql_dir}/24-ohio-release-dark-plan.sql")"; then
        die "Ohio release dark-build plan failed; no county build was attempted"
      fi
      mapfile -t pending < <(printf '%s\n' "${plan_output}" | grep -E '^OH\|[A-Z]{3}$' || true)
      total=${#pending[@]}
      if [[ "${total}" -eq 0 ]]; then
        printf 'No pending release-current Ohio dark county builds.\n'
        exit 0
      fi
      [[ "${total}" -le 18 ]] || die "Ohio post-canary plan unexpectedly contains more than 18 counties"
      printf 'Remaining Ohio dark-build plan: %s counties. Serial, fail-stop, no activation.\n' "${total}"
      printf '%s\n' "${pending[@]}"
      completed=0
      for scope in "${pending[@]}"; do
        IFS='|' read -r state county <<<"${scope}"
        [[ "${state}" == "OH" ]] || die "non-Ohio scope leaked into Ohio batch: ${state}:${county}"
        validate_scope "${state}" "${county}"
        [[ "${county}" != "NOB" ]] || die "Noble canary unexpectedly remained in post-canary Ohio plan"
        printf '\n[%s/%s] Ohio release dark build %s %s\n' "$((completed + 1))" "${total}" "${state}" "${county}"
        build_release_scope "${state}" "${county}" "19-verify-county-release.sql" ohio-batch
        completed=$((completed + 1))
        printf '[%s/%s] PASS %s %s; build remains inactive.\n' "${completed}" "${total}" "${state}" "${county}"
        if [[ "${completed}" -lt "${total}" ]]; then sleep 5; fi
      done
      printf '\nOhio dark-build batch complete: %s/%s. No WV/PA build, activation, cutover, route publication or retry occurred.\n' "${completed}" "${total}"
      printf 'STOP for one whole-Ohio independent read-only audit before Ohio activation/pad reconciliation work.\n'
      ;;
    canaries|plan-release-dark|build-pending-release-dark)
      die "mixed-state release command disabled during Ohio-first phase; use ohio-canary, plan-ohio-dark, or build-pending-ohio-dark"
      ;;
    *) usage; die "unknown command: ${command_name}" ;;
  esac
}

main "$@"
