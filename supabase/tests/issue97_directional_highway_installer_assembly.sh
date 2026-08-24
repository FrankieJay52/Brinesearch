#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
installer="${repo_root}/ops/issue97-computer-rollout/issue97-directional-highway-install.sh"
psql_bin="${repo_root}/.tools/postgresql17/bin/psql.exe"
die() { printf 'ERROR: %s\n' "$*" >&2; exit 2; }

[[ $# -eq 0 ]] || die "installer assembly regression accepts no arguments"
[[ "${PGSERVICE:-}" == "brinesearch_issue97_prod" ]] || die "PGSERVICE must be brinesearch_issue97_prod"
[[ -z "${PGPASSWORD+x}" ]] || die "PGPASSWORD must not be set"
[[ -x "${psql_bin}" ]] || die "reviewed PostgreSQL client is missing"
source "${installer}"

umask 077
rendered="$(mktemp "${TMPDIR:-/tmp}/issue97-directional-installer-render.XXXXXX.sql")"
rollback_sql="$(mktemp "${TMPDIR:-/tmp}/issue97-directional-installer-rollback.XXXXXX.sql")"
trap 'rm -f -- "${rendered}" "${rollback_sql}"' EXIT

render_install_sql >"${rendered}"
grep -Fq 'ARRAY[$issue97_migration_20260817030000$' "${rendered}" ||
  die "rendered opening history delimiter is not literal SQL"
grep -Fq '$issue97_migration_20260817030000$]::text[]' "${rendered}" ||
  die "rendered closing history delimiter is not literal SQL"
[[ "$(grep -Fc 'insert into supabase_migrations.schema_migrations' "${rendered}")" -eq 1 ]] ||
  die "rendered installer must contain exactly one history insertion"
[[ "$(tail -n 1 "${rendered}")" == 'commit;' ]] || die "rendered installer does not end in COMMIT"
sed '$s/^commit;$/rollback;/' "${rendered}" >"${rollback_sql}"

export PGSSLMODE=require
export PGAPPNAME=brinesearch-issue97-directional-installer-assembly-rollback
"${psql_bin}" -X --no-psqlrc --set=ON_ERROR_STOP=1 --file="${rollback_sql}"

status="$("${psql_bin}" -X --no-psqlrc --set=ON_ERROR_STOP=1 --tuples-only --no-align --quiet --command="
  set statement_timeout='5min';
  select pg_catalog.jsonb_build_object(
    'migration_rows',(select count(*) from supabase_migrations.schema_migrations where version='20260817030000'),
    'candidate_md5',pg_catalog.md5(pg_catalog.pg_get_functiondef('private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::pg_catalog.regprocedure)),
    'receipts',(select count(*) from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
      join public.brinesearch_route_prep route on route.id=receipt.route_prep_id
      join public.pads pad on pad.id=route.pad_id where pad.state='Ohio' and route.active and route.route_group in ('primary','alternate')),
    'latest_receipt',(select max(receipt.updated_at) from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
      join public.brinesearch_route_prep route on route.id=receipt.route_prep_id
      join public.pads pad on pad.id=route.pad_id where pad.state='Ohio' and route.active and route.route_group in ('primary','alternate')),
    'public_google',(select count(*) from public.brinesearch_driver_google_routes_public),
    'cutover',public.brinesearch_issue97_cutover_active()
  )::text;")"
[[ "${status}" == *'"migration_rows": 0'* &&
   "${status}" == *'"candidate_md5": "72c16f75efdb356dc2b6d15c691e944c"'* &&
   "${status}" == *'"receipts": 806'* &&
   "${status}" == *'"latest_receipt": "2026-08-17T06:41:25.563805+00:00"'* &&
   "${status}" == *'"public_google": 0'* && "${status}" == *'"cutover": false'* ]] ||
  die "fresh post-rollback production state mismatch: ${status}"

printf 'PASS: exact directional installer SQL executed through postflight and ended in ROLLBACK; production is unchanged.\n'
