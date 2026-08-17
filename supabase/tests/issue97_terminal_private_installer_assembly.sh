#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
installer="${repo_root}/ops/issue97-computer-rollout/issue97-terminal-private-access-install.sh"
psql_bin="${repo_root}/.tools/postgresql17/bin/psql.exe"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 2; }
[[ $# -eq 0 ]] || die "installer assembly regression accepts no arguments"
[[ "${PGSERVICE:-}" == "brinesearch_issue97_prod" ]] || die "PGSERVICE must be brinesearch_issue97_prod"
[[ -z "${PGPASSWORD+x}" ]] || die "PGPASSWORD must not be set"
[[ -x "${psql_bin}" ]] || die "reviewed PostgreSQL client is missing"

# shellcheck source=../../ops/issue97-computer-rollout/issue97-terminal-private-access-install.sh
source "${installer}"

umask 077
rendered="$(mktemp "${TMPDIR:-/tmp}/issue97-terminal-installer-render.XXXXXX.sql")"
rollback_sql="$(mktemp "${TMPDIR:-/tmp}/issue97-terminal-installer-rollback.XXXXXX.sql")"
trap 'rm -f -- "${rendered}" "${rollback_sql}"' EXIT

render_install_sql >"${rendered}"
grep -Fq 'ARRAY[$issue97_migration_20260817020000$' "${rendered}" ||
  die "rendered opening history delimiter is not literal SQL"
grep -Fq '$issue97_migration_20260817020000$]::text[]' "${rendered}" ||
  die "rendered closing history delimiter is not literal SQL"
if grep -Fq '\$issue97_migration_20260817020000' "${rendered}"; then
  die "rendered history delimiter contains a psql meta-command backslash"
fi
[[ "$(grep -Fc 'insert into supabase_migrations.schema_migrations' "${rendered}")" -eq 1 ]] ||
  die "rendered installer must contain exactly one history insertion"
[[ "$(tail -n 1 "${rendered}")" == 'commit;' ]] || die "rendered installer does not end in COMMIT"

sed '$s/^commit;$/rollback;/' "${rendered}" >"${rollback_sql}"
export PGSSLMODE=require
export PGAPPNAME=brinesearch-issue97-terminal-installer-assembly-rollback
"${psql_bin}" -X --no-psqlrc --set=ON_ERROR_STOP=1 --file="${rollback_sql}"

status="$("${psql_bin}" -X --no-psqlrc --set=ON_ERROR_STOP=1 --tuples-only --no-align --quiet --command="
  set statement_timeout='5min';
  select pg_catalog.jsonb_build_object(
    'migration_rows',(select count(*) from supabase_migrations.schema_migrations where version='20260817020000'),
    'classifier',pg_catalog.to_regprocedure('private_verification.brinesearch_issue97_terminal_private_access_destination(uuid)') is not null,
    'candidate_md5',pg_catalog.md5(pg_catalog.pg_get_functiondef('private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::pg_catalog.regprocedure)),
    'resolver_md5',pg_catalog.md5(pg_catalog.pg_get_functiondef('private_verification.brinesearch_issue97_resolve_route_identity_path(uuid)'::pg_catalog.regprocedure)),
    'public_google',(select count(*) from public.brinesearch_driver_google_routes_public),
    'cutover',public.brinesearch_issue97_cutover_active()
  )::text;")"
[[ "${status}" == *'"migration_rows": 0'* && "${status}" == *'"classifier": false'* &&
   "${status}" == *'"candidate_md5": "fe7e266f1ed459bccf17b06010c2a050"'* &&
   "${status}" == *'"resolver_md5": "98f1421b95df8fc889ccb85a69f922cc"'* &&
   "${status}" == *'"public_google": 0'* && "${status}" == *'"cutover": false'* ]] ||
  die "fresh post-rollback production state mismatch: ${status}"

printf 'PASS: exact installer-render SQL parsed/executed through postflight and ended in ROLLBACK; production state is unchanged.\n'
