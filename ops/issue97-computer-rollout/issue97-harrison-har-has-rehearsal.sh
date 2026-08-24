#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
installer="ops/issue97-computer-rollout/issue97-harrison-har-has-install.sh"
# shellcheck source=issue97-harrison-har-has-install.sh
source "${repo_root}/${installer}"

main() {
  local before after status sql_file canonical_tmp log_file marker rc start_utc end_utc branch
  [[ $# -eq 0 ]] || die "rehearsal accepts no arguments"
  branch="$(git -C "${repo_root}" branch --show-current)"
  [[ "${branch}" == "${expected_branch}" ]] || die "wrong branch ${branch:-detached}"
  require_secure_lane
  require_exact_artifacts
  mkdir -p "${log_dir}"
  marker="${log_dir}/issue97-harrison-renderer-rehearsal.${migration_blob}.${renderer_blob}.attempted"
  [[ ! -e "${marker}" ]] || die "the one rollback rehearsal for these exact artifacts was already consumed"
  export PGAPPNAME=brinesearch-issue97-harrison-renderer-rollback-rehearsal
  run_psql --command="begin read only; set local statement_timeout='15min'; set local lock_timeout='2min'; ${guard_sql} rollback;" >/dev/null
  before="$(run_psql --tuples-only --no-align --quiet --command="set statement_timeout='15min'; set lock_timeout='2min'; ${protected_snapshot_sql}")"
  [[ -n "${before}" ]] || die "rehearsal before-snapshot is empty"

  umask 077
  sql_file="$(mktemp "${TMPDIR:-/tmp}/issue97-harrison-renderer-rehearsal.XXXXXX.sql")"
  canonical_tmp="$(mktemp "${TMPDIR:-/tmp}/issue97-harrison-renderer-canonical.XXXXXX.sql")"
  rm -f -- "${canonical_tmp}"
  trap 'rm -f -- "${sql_file:-}" "${canonical_tmp:-}"' EXIT
  prepare_canonical_sql "${canonical_tmp}"
  render_transaction_sql rollback >"${sql_file}"
  log_file="${log_dir}/$(date -u +%Y%m%dT%H%M%SZ)-harrison-renderer-rollback-rehearsal.log"
  start_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'REHEARSAL_START_UTC=%s\nMIGRATION_GIT_BLOB=%s\nRENDERER_GIT_BLOB=%s\nCANONICAL_BYTES=%s\nCANONICAL_MD5=%s\nCANONICAL_SHA256=%s\n' \
    "${start_utc}" "${migration_blob}" "${renderer_blob}" "${canonical_bytes}" \
    "${canonical_md5}" "${canonical_sha256}" >"${log_file}"
  printf 'attempted_at=%s\nlog=%s\n' "${start_utc}" "${log_file}" >"${marker}"
  printf 'Harrison canonical-renderer rollback rehearsal log: %s\n' "${log_file}"
  set +e
  run_psql --file="${sql_file}" >>"${log_file}" 2>&1
  rc=$?
  set -e
  end_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'REHEARSAL_END_UTC=%s\nCLIENT_EXIT_CODE=%s\n' "${end_utc}" "${rc}" >>"${log_file}"
  command cat -- "${log_file}"
  if [[ "${rc}" -ne 0 ]]; then
    printf 'Fresh one-shot server status after failed/ambiguous rehearsal (NO RETRY):\n' >&2
    run_psql --tuples-only --no-align --quiet --command="${status_sql}" >&2 || true
    die "Harrison canonical-renderer rehearsal failed; do not retry"
  fi
  after="$(run_psql --tuples-only --no-align --quiet --command="set statement_timeout='15min'; set lock_timeout='2min'; ${protected_snapshot_sql}")"
  [[ -n "${after}" && "${after}" == "${before}" ]] || die "rollback rehearsal changed durable production state"
  status="$(run_psql --tuples-only --no-align --quiet --command="${status_sql}")"
  run_psql --command="begin read only; set local statement_timeout='15min'; set local lock_timeout='2min'; ${guard_sql} rollback;" >/dev/null ||
    die "rollback rehearsal failed the fresh protected-state guard"
  printf 'Fresh protected status: %s\n' "${status}"
  printf 'PASS: canonical history bytes matched inside the transaction; final ROLLBACK and full production equality proved.\n'
  rm -f -- "${sql_file}" "${canonical_tmp}"
  trap - EXIT
}

main "$@"
