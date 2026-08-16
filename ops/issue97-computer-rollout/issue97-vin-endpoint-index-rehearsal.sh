#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/../.." && pwd)"
expected_branch="data/issue-97-authoritative-road-junction-graph"
migration_file="supabase/migrations/20260816090000_issue97_vin_endpoint_index_performance.sql"
migration_version="20260816090000"
migration_name="issue97_vin_endpoint_index_performance"
history_tag="issue97_migration_20260816090000"
log_dir="${repo_root}/.issue97-runs"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 2; }
run_psql() { psql -X --no-psqlrc --set=ON_ERROR_STOP=1 "$@"; }

require_repo_checkpoint() {
  local branch local_head remote_head
  command -v git >/dev/null 2>&1 || die "git is not installed"
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
  [[ "${PGSERVICE:-}" == "brinesearch_issue97_prod" ]] ||
    die "PGSERVICE must be the existing brinesearch_issue97_prod private profile"
  [[ -z "${PGPASSWORD+x}" ]] || die "do not use PGPASSWORD; keep the password in .pgpass/keychain"
  for variable_name in PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGOPTIONS PGCONNECT_TIMEOUT \
    DATABASE_URL SUPABASE_DB_URL SUPABASE_DATABASE_URL; do
    [[ -z "${!variable_name+x}" ]] || die "unset ${variable_name}; use only PGSERVICE"
  done
  export PGSSLMODE="require"
  export PGAPPNAME="brinesearch-issue97-vin-index-rehearsal"
}

verify_file() {
  local file="${repo_root}/${migration_file}"
  [[ -f "${file}" ]] || die "missing exact VIN index migration ${migration_file}"
  [[ "${migration_file##*/}" == "${migration_version}_${migration_name}.sql" ]] ||
    die "VIN index migration filename changed"
  grep -Fq "brinesearch_supp_vin_start_geog_issue97_idx" "${file}" || die "VIN start index is missing"
  grep -Fq "brinesearch_supp_vin_end_geog_issue97_idx" "${file}" || die "VIN end index is missing"
  grep -Fq "06705f5b35a6d37151bb2c0dc5ade9bd" "${file}" || die "r2 builder pin is missing"
  grep -Fq "00c7ac96038083e8765439bcf1c034b2" "${file}" || die "CAR captured mapping digest is missing"
  grep -Fq "a2a49ac4f11baa703f05a493cf331c35" "${file}" || die "CAR current mapping digest is missing"
  if grep -Fq "\$${history_tag}\$" "${file}"; then
    die "VIN index migration contains the reserved history dollar-quote tag"
  fi
}

snapshot_sql="$(cat <<'SQL'
select pg_catalog.jsonb_build_object(
  'builder_md5',pg_catalog.md5(pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure)),
  'generation',private_verification.brinesearch_issue97_active_graph_release_generation(),
  'generation_digest',(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    generation_key||':'||pg_catalog.to_jsonb(g)::text,'|' order by generation_key),''))
    from private_verification.brinesearch_issue97_graph_release_generations g),
  'qualification_digest',(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    build_id::text||':'||generation_key||':'||pg_catalog.to_jsonb(q)::text,
    '|' order by build_id,generation_key),''))
    from private_verification.brinesearch_issue97_graph_release_qualifications q),
  'cutover',public.brinesearch_issue97_cutover_active(),
  'build_digest',(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    id::text||':'||pg_catalog.to_jsonb(b)::text,'|' order by id),''))
    from public.brinesearch_road_graph_builds b),
  'junction_count',(select count(*) from public.brinesearch_road_junctions),
  'anchor_count',(select count(*) from public.brinesearch_road_junction_anchors),
  'membership_count',(select count(*) from public.brinesearch_road_junction_memberships),
  'reconciliation_count',(select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs),
  'google_receipt_count',(select count(*) from private_verification.brinesearch_google_route_receipts_issue97),
  'public_google_count',(select count(*) from public.brinesearch_driver_google_routes_public),
  'migration_digest',(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    version||':'||coalesce(name,'')||':'||coalesce(pg_catalog.array_to_string(statements,E'\n'),''),
    '|' order by version),'')) from supabase_migrations.schema_migrations),
  'vin_indexes',(select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'name',index_class.relname,'definition',pg_catalog.pg_get_indexdef(index_class.oid))
    order by index_class.relname),'[]'::jsonb)
    from pg_catalog.pg_class index_class where index_class.relname in (
      'brinesearch_supp_vin_start_geog_issue97_idx','brinesearch_supp_vin_end_geog_issue97_idx'))
)::text;
SQL
)"

guard_sql="$(cat <<'SQL'
do $guard$
begin
  if exists(select 1 from pg_catalog.pg_stat_activity activity
      where activity.pid<>pg_catalog.pg_backend_pid()
        and activity.state in ('active','idle in transaction','idle in transaction (aborted)')
        and activity.query ilike '%brinesearch_issue97_rebuild_county_graph%') then
    raise exception 'Issue #97 VIN index rehearsal refuses an active graph builder';
  end if;
  if exists(select 1 from supabase_migrations.schema_migrations where version='20260816090000')
     or pg_catalog.to_regclass('public.brinesearch_supp_vin_start_geog_issue97_idx') is not null
     or pg_catalog.to_regclass('public.brinesearch_supp_vin_end_geog_issue97_idx') is not null then
    raise exception 'Issue #97 VIN index rehearsal requires migration and indexes absent';
  end if;
end
$guard$;
SQL
)"

status_sql="$(cat <<'SQL'
select pg_catalog.jsonb_build_object(
  'builder_md5',pg_catalog.md5(pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure)),
  'generation',private_verification.brinesearch_issue97_active_graph_release_generation(),
  'migration_installed',(select count(*) from supabase_migrations.schema_migrations where version='20260816090000'),
  'vin_index_count',(select count(*) from pg_catalog.pg_class where relname in (
    'brinesearch_supp_vin_start_geog_issue97_idx','brinesearch_supp_vin_end_geog_issue97_idx')),
  'cutover',public.brinesearch_issue97_cutover_active(),
  'staging',(select count(*) from public.brinesearch_road_graph_builds where status='staging'),
  'builder_sessions',(select count(*) from pg_catalog.pg_stat_activity activity
    where activity.pid<>pg_catalog.pg_backend_pid()
      and activity.state in ('active','idle in transaction','idle in transaction (aborted)')
      and activity.query ilike '%brinesearch_issue97_rebuild_county_graph%'),
  'vin_r2_builds',(select count(*) from public.brinesearch_road_graph_builds
    where state_code='OH' and county_code='VIN'
      and details->>'release_generation_key'='issue97-release-20260815-r2'),
  'was_r2_builds',(select count(*) from public.brinesearch_road_graph_builds
    where state_code='OH' and county_code='WAS'
      and details->>'release_generation_key'='issue97-release-20260815-r2')
)::text;
SQL
)"

main() {
  local before after sql_file log_file rc
  [[ $# -eq 0 ]] || die "VIN endpoint-index rollback rehearsal accepts no arguments"
  require_repo_checkpoint
  require_connection_profile
  verify_file
  run_psql --command="${guard_sql}" >/dev/null
  before="$(run_psql --tuples-only --no-align --quiet --command="${snapshot_sql}")"
  [[ -n "${before}" ]] || die "failed to capture VIN index rehearsal before snapshot"

  umask 077
  mkdir -p "${log_dir}"
  sql_file="$(mktemp "${TMPDIR:-/tmp}/issue97-vin-index-rehearsal.XXXXXX.sql")"
  log_file="${log_dir}/$(date -u +%Y%m%dT%H%M%SZ)-vin-index-rehearsal.log"
  trap 'if [[ -n "${sql_file:-}" ]]; then rm -f -- "${sql_file}"; fi' EXIT
  {
    printf '\\set ON_ERROR_STOP on\n'
    printf 'begin;\n'
    printf "set local statement_timeout='10min';\n"
    printf "set local lock_timeout='2min';\n"
    sed 's/\r$//' "${repo_root}/${migration_file}"
    printf '\n'
    printf "insert into supabase_migrations.schema_migrations(version,statements,name) values ('%s',ARRAY[\$%s\$" \
      "${migration_version}" "${history_tag}"
    sed 's/\r$//' "${repo_root}/${migration_file}"
    printf "\$%s\$]::text[],'%s');\n" "${history_tag}" "${migration_name}"
    printf 'do $verify$ begin\n'
    printf "  if (select count(*) from supabase_migrations.schema_migrations where version='%s' and name='%s' and cardinality(statements)=1)<>1 then raise exception 'Issue #97 VIN index rehearsal history mismatch'; end if;\n" "${migration_version}" "${migration_name}"
    printf "  if pg_catalog.md5(pg_catalog.pg_get_functiondef('public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure))<>'06705f5b35a6d37151bb2c0dc5ade9bd' then raise exception 'Issue #97 VIN index rehearsal builder mismatch'; end if;\n"
    printf 'end $verify$;\n'
    printf 'rollback;\n'
  } > "${sql_file}"

  printf 'VIN endpoint-index rehearsal log: %s\n' "${log_file}"
  set +e
  run_psql --file="${sql_file}" > "${log_file}" 2>&1
  rc=$?
  set -e
  while IFS= read -r line || [[ -n "${line}" ]]; do printf '%s\n' "${line}"; done < "${log_file}"
  after="$(run_psql --tuples-only --no-align --quiet --command="${snapshot_sql}" 2>/dev/null || true)"
  if [[ "${rc}" -ne 0 || -z "${after}" || "${after}" != "${before}" ]]; then
    printf 'Fresh one-shot server status (NO RETRY):\n' >&2
    run_psql --tuples-only --no-align --quiet --command="${status_sql}" >&2 || true
    [[ "${rc}" -eq 0 ]] || die "VIN endpoint-index rehearsal failed; do not retry"
    die "rehearsal returned success but fresh exact rollback equality was not proven"
  fi
  rm -f -- "${sql_file}"
  trap - EXIT
  printf 'PASS: exact-one VIN endpoint-index migration compiled and verified; explicit ROLLBACK completed; fresh after-snapshot matched before-snapshot exactly.\n'
}

main "$@"
