#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
expected_branch="data/issue-97-authoritative-road-junction-graph"
migration_file="supabase/migrations/20260817020000_issue97_terminal_private_access_path_isolation.sql"
migration_version="20260817020000"
migration_name="issue97_terminal_private_access_path_isolation"
migration_blob="137b2b62a4419dab923d6782ecfc4ba9eec9e70a"
migration_md5="6bf6791912a3423ba28379efe681ba47"
history_tag="issue97_migration_20260817020000"
psql_bin="${repo_root}/.tools/postgresql17/bin/psql.exe"
log_dir="${repo_root}/.issue97-runs"
attempt_file="${log_dir}/20260817-terminal-private-access-reviewed-install.attempted"
current_head=""

die() { printf 'ERROR: %s\n' "$*" >&2; exit 2; }
run_psql() { "${psql_bin}" -X --no-psqlrc --set=ON_ERROR_STOP=1 "$@"; }

require_checkpoint() {
  local branch local_head remote_head
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
  printf 'Repository checkpoint: %s @ %s\n' "${expected_branch}" "${current_head}"
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
  export PGAPPNAME=brinesearch-issue97-terminal-private-install-only
}

guard_sql="$(cat <<'SQL'
do $issue97_terminal_install_guard$
declare v_required integer; v_current integer;
begin
  if (select count(*) from supabase_migrations.schema_migrations
      where version='20260817020000')<>0
     or pg_catalog.to_regprocedure(
       'private_verification.brinesearch_issue97_terminal_private_access_destination(uuid)'
     ) is not null then
    raise exception 'Issue #97 terminal private-access migration/helper must be absent';
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
           and receipt.route_status='route_ready')<>2 then
    raise exception 'Issue #97 active Ohio receipt pins drifted';
  end if;
  select count(*)::integer,
    count(*) filter(where private_verification.brinesearch_issue97_dataset_scope_current(
      scope.dataset_id,scope.state_code,scope.county_code
    ))::integer into v_required,v_current
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
$issue97_terminal_install_guard$;
SQL
)"

lock_sql="$(cat <<'SQL'
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('brinesearch:issue97:ohio-state-release'));
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('brinesearch:issue97:all-pad-routing-pipeline',97));
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('brinesearch:issue97:route-corpus',97));
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('brinesearch:issue97:saved-road-reconciliation'));
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('brinesearch:issue97:mapping-refresh'));
SQL
)"

snapshot_sql="$(cat <<'SQL'
select pg_catalog.jsonb_build_object(
  'build_digest',(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(build)::text,'|' order by build.id),'')) from public.brinesearch_road_graph_builds build),
  'junctions',(select count(*) from public.brinesearch_road_junctions),
  'anchors',(select count(*) from public.brinesearch_road_junction_anchors),
  'memberships',(select count(*) from public.brinesearch_road_junction_memberships),
  'reconciliation_receipts',(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id),''))
    from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt),
  'occurrence_receipts',(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id,receipt.occurrence_index),''))
    from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt),
  'transition_receipts',(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id,receipt.boundary_index),''))
    from private_verification.brinesearch_route_transition_receipts_issue97 receipt),
  'geometry_receipts',(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id,receipt.occurrence_index),''))
    from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt),
  'private_google',(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.pad_id),''))
    from private_verification.brinesearch_google_route_receipts_issue97 receipt),
  'public_google',(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(route)::text,'|' order by route.pad_id),''))
    from public.brinesearch_driver_google_routes_public route),
  'release_state',(select pg_catalog.md5(pg_catalog.to_jsonb(release_state)::text)
    from public.brinesearch_issue97_release_state release_state where singleton),
  'ohio_sources',(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(scope)::text,'|' order by scope.dataset_id,scope.state_code,scope.county_code),''))
    from public.brinesearch_road_source_dataset_counties scope where state_code='OH')
)::text;
SQL
)"

postflight_sql="$(cat <<'SQL'
do $issue97_terminal_install_postflight$
declare v_function pg_catalog.regprocedure;
begin
  if (select count(*) from supabase_migrations.schema_migrations
      where version='20260817020000'
        and name='issue97_terminal_private_access_path_isolation'
        and cardinality(statements)=1
        and pg_catalog.md5(statements[1])='6bf6791912a3423ba28379efe681ba47')<>1 then
    raise exception 'Issue #97 terminal private-access migration history mismatch';
  end if;
  if pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_issue97_terminal_private_access_destination(uuid)'::pg_catalog.regprocedure
     ))<>'34bdc93597f6da3cad68376ca01906c1'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::pg_catalog.regprocedure
     ))<>'72c16f75efdb356dc2b6d15c691e944c'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_issue97_resolve_route_identity_path(uuid)'::pg_catalog.regprocedure
     ))<>'8ad311611cf361ca457e4084128b9cfb' then
    raise exception 'Issue #97 terminal private-access installed definition mismatch';
  end if;
  foreach v_function in array array[
    'private_verification.brinesearch_issue97_terminal_private_access_destination(uuid)'::pg_catalog.regprocedure,
    'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::pg_catalog.regprocedure,
    'private_verification.brinesearch_issue97_resolve_route_identity_path(uuid)'::pg_catalog.regprocedure
  ] loop
    if pg_catalog.has_function_privilege('anon',v_function,'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated',v_function,'EXECUTE')
       or pg_catalog.has_function_privilege('service_role',v_function,'EXECUTE')
       or exists(select 1 from pg_catalog.pg_proc procedure
         cross join lateral pg_catalog.aclexplode(coalesce(
           procedure.proacl,pg_catalog.acldefault('f',procedure.proowner)
         )) acl where procedure.oid=v_function::oid and acl.grantee=0
           and acl.privilege_type='EXECUTE') then
      raise exception 'Issue #97 private function has exposed EXECUTE: %',v_function;
    end if;
  end loop;
  if public.brinesearch_issue97_cutover_active()
     or exists(select 1 from public.brinesearch_road_graph_builds where status='staging')
     or (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)<>0
     or (select count(*) from public.brinesearch_driver_google_routes_public)<>0 then
    raise exception 'Issue #97 terminal private-access installation changed protected rollout state';
  end if;
end
$issue97_terminal_install_postflight$;
SQL
)"

status_sql="$(cat <<'SQL'
select pg_catalog.jsonb_build_object(
 'migration_rows',(select count(*) from supabase_migrations.schema_migrations where version='20260817020000'),
 'classifier',pg_catalog.to_regprocedure('private_verification.brinesearch_issue97_terminal_private_access_destination(uuid)') is not null,
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
  sql_file="$(mktemp "${TMPDIR:-/tmp}/issue97-terminal-private-install.XXXXXX.sql")"
  log_file="${log_dir}/$(date -u +%Y%m%dT%H%M%SZ)-terminal-private-access-install.log"
  trap 'if [[ -n "${sql_file:-}" ]]; then rm -f -- "${sql_file}"; fi' EXIT
  {
    printf '\\set ON_ERROR_STOP on\n'
    printf 'begin;\nset local statement_timeout='\''15min'\'';\nset local lock_timeout='\''2min'\'';\n'
    printf '%s\n%s\n' "${lock_sql}" "${guard_sql}"
    sed 's/\r$//' "${repo_root}/${migration_file}"
    printf '\ninsert into supabase_migrations.schema_migrations(version,statements,name) values ('\''%s'\'',ARRAY[\$%s\$' \
      "${migration_version}" "${history_tag}"
    sed 's/\r$//' "${repo_root}/${migration_file}"
    printf '$%s$]::text[],'\''%s'\'');\n' "${history_tag}" "${migration_name}"
    printf '%s\ncommit;\n' "${postflight_sql}"
  } >"${sql_file}"

  start_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'INSTALL_START_UTC=%s\nMIGRATION_VERSION=%s\nMIGRATION_NAME=%s\nMIGRATION_GIT_BLOB=%s\nMIGRATION_SQL_MD5=%s\n' \
    "${start_utc}" "${migration_version}" "${migration_name}" "${migration_blob}" "${migration_md5}" >"${log_file}"
  printf 'attempted_at=%s\nsha=%s\nlog=%s\n' "${start_utc}" "${current_head}" "${log_file}" >"${attempt_file}"
  printf 'Terminal private-access production installation log: %s\n' "${log_file}"
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
    die "terminal private-access installer failed; do not retry"
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
  printf 'PASS: exact terminal private-access migration installed atomically once; protected route/graph/public state unchanged.\n'
  rm -f -- "${sql_file}"
  trap - EXIT
}

main "$@"
