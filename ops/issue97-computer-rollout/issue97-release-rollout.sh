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
  issue97-release-rollout.sh canaries
  issue97-release-rollout.sh plan-release-dark
  issue97-release-rollout.sh build-pending-release-dark

This release-generation lane is deliberately narrower than the historical
computer rollout. It accepts no database URI, password, token, SQL, build ID or
activation input. Configure a private libpq service and export only PGSERVICE.

canaries runs exactly OH/NOB then PA/WAS, serially and fail-stop. It never
retries, activates a graph, changes global cutover, publishes routes or starts
the remaining-county batch.

build-pending-release-dark must be run only after the canary checkpoint has been
independently audited. It computes the remaining queue from release-currentness,
runs counties serially, stops at the first failure and never retries.
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
    canaries)
      [[ $# -eq 0 ]] || die "canaries accepts no arguments"
      run_sql "${sql_dir}/17-release-preflight.sql"
      printf 'Canary 1/2: OH NOB semantic topology canary. No retry.\n'
      build_release_scope OH NOB "21-verify-nob-leonard-release.sql" canary
      printf 'Canary 1/2 PASS: OH NOB validated and inactive.\n'
      sleep 5
      printf 'Canary 2/2: PA WAS Possum/performance canary. No retry.\n'
      build_release_scope PA WAS "22-verify-pa-was-possum-release.sql" canary
      printf 'Canary 2/2 PASS: PA WAS validated and inactive.\n'
      printf 'STOP: canary checkpoint requires one independent read-only audit before the remaining batch.\n'
      ;;
    plan-release-dark)
      [[ $# -eq 0 ]] || die "plan-release-dark accepts no arguments"
      run_sql "${sql_dir}/17-release-preflight.sql"
      run_logged_sql plan-release-dark "${sql_dir}/20-release-dark-plan.sql"
      ;;
    build-pending-release-dark)
      [[ $# -eq 0 ]] || die "build-pending-release-dark accepts no arguments"
      local plan_output scope state county completed total
      local -a pending=()
      run_sql "${sql_dir}/17-release-preflight.sql"
      # This command intentionally refuses to be the canary runner. Both canary
      # counties must already have release-current active/validated generations.
      run_sql "${sql_dir}/23-release-canary-complete-gate.sql"
      if ! plan_output="$(run_plan_sql "${sql_dir}/20-release-dark-plan.sql")"; then
        die "release dark-build plan failed; no county build was attempted"
      fi
      mapfile -t pending < <(printf '%s\n' "${plan_output}" | grep -E '^(OH|WV|PA)\|[A-Z]{3}$' || true)
      total=${#pending[@]}
      if [[ "${total}" -eq 0 ]]; then
        printf 'No pending release-current dark county builds.\n'
        exit 0
      fi
      printf 'Remaining release dark-build plan: %s counties. Serial, fail-stop, no activation.\n' "${total}"
      printf '%s\n' "${pending[@]}"
      completed=0
      for scope in "${pending[@]}"; do
        IFS='|' read -r state county <<<"${scope}"
        validate_scope "${state}" "${county}"
        [[ "${state}:${county}" != "OH:NOB" && "${state}:${county}" != "PA:WAS" ]] ||
          die "canary county unexpectedly remained in post-canary plan: ${state}:${county}"
        printf '\n[%s/%s] Release dark build %s %s\n' "$((completed + 1))" "${total}" "${state}" "${county}"
        build_release_scope "${state}" "${county}" "19-verify-county-release.sql" batch
        completed=$((completed + 1))
        printf '[%s/%s] PASS %s %s; build remains inactive.\n' "${completed}" "${total}" "${state}" "${county}"
        if [[ "${completed}" -lt "${total}" ]]; then sleep 5; fi
      done
      printf '\nRelease dark-build batch complete: %s/%s. No activation/cutover/route publication/retry occurred.\n' "${completed}" "${total}"
      printf 'STOP for checkpoint-wide independent audit.\n'
      ;;
    *) usage; die "unknown command: ${command_name}" ;;
  esac
}

main "$@"
