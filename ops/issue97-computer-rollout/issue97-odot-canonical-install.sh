#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/../.." && pwd)"
expected_branch="data/issue-97-authoritative-road-junction-graph"
migration_file="supabase/migrations/20260815090000_issue97_odot_overlap_canonical_provenance.sql"
migration_version="20260815090000"
migration_name="issue97_odot_overlap_canonical_provenance"
history_tag="issue97_migration_20260815090000"
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
  export PGAPPNAME="brinesearch-issue97-odot-canonical-install"
}

verify_file() {
  local file="${repo_root}/${migration_file}"
  [[ -f "${file}" ]] || die "missing exact hotfix migration ${migration_file}"
  [[ "${migration_file##*/}" == "${migration_version}_${migration_name}.sql" ]] ||
    die "hotfix migration filename changed"
  grep -Fq '$issue97_odot_canonical_builder_patch$' "${file}" ||
    die "hotfix builder patch block is missing"
  grep -Fq "06705f5b35a6d37151bb2c0dc5ade9bd" "${file}" ||
    die "hotfix final builder pin is missing"
  if grep -Fq "\$${history_tag}\$" "${file}"; then
    die "hotfix migration contains the reserved history dollar-quote tag"
  fi
}

base_versions="'20260814074500','20260814160000','20260814160050','20260814161000','20260814161100','20260814161200','20260814161300','20260814161400','20260814161500','20260814162000','20260814163000','20260814163050','20260814163100','20260814163200','20260814163250','20260814163300','20260814163400','20260814164000','20260814164100','20260814164200','20260814164250','20260814164300'"

protected_snapshot_sql="$(cat <<'SQL'
select pg_catalog.jsonb_build_object(
  'cutover_active',public.brinesearch_issue97_cutover_active(),
  'build_state_digest',(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    b.id::text||':'||pg_catalog.to_jsonb(b)::text,'|' order by b.id),''))
    from public.brinesearch_road_graph_builds b),
  'junction_count',(select count(*) from public.brinesearch_road_junctions),
  'anchor_count',(select count(*) from public.brinesearch_road_junction_anchors),
  'membership_count',(select count(*) from public.brinesearch_road_junction_memberships),
  'reconciliation_count',(select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs),
  'google_receipt_count',(select count(*) from private_verification.brinesearch_google_route_receipts_issue97),
  'public_google_count',(select count(*) from public.brinesearch_driver_google_routes_public)
)::text;
SQL
)"

preflight_sql="$(cat <<SQL
do \$gate\$
declare v_required integer; v_current integer;
begin
  if public.brinesearch_issue97_cutover_active()
     or exists(select 1 from public.brinesearch_road_graph_builds where status='staging') then
    raise exception 'Issue #97 ODOT hotfix installer requires cutover OFF and staging zero';
  end if;
  if exists(select 1 from pg_catalog.pg_stat_activity activity
      where activity.pid<>pg_catalog.pg_backend_pid()
        and activity.state in ('active','idle in transaction','idle in transaction (aborted)')
        and (activity.query ilike '%brinesearch_issue97_rebuild_county_graph%'
          or activity.application_name='brinesearch-issue97-odot-canonical-install'
          or activity.application_name='brinesearch-issue97-odot-canonical-rehearsal')) then
    raise exception 'Issue #97 ODOT hotfix installer refuses a concurrent builder/installer';
  end if;
  if (select count(*) from supabase_migrations.schema_migrations
      where version in (${base_versions}))<>22
     or exists(select 1 from supabase_migrations.schema_migrations
       where version='${migration_version}') then
    raise exception 'Issue #97 ODOT hotfix installer requires base 22/22 and hotfix 0/1';
  end if;
  if pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
     ))<>'e0528f257f3c1b6d40341b735f284f1d'
     or private_verification.brinesearch_issue97_active_graph_release_generation()
       <>'issue97-release-20260814-r1' then
    raise exception 'Issue #97 ODOT hotfix installer predecessor builder/generation changed';
  end if;
  if (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)<>0
     or (select count(*) from private_verification.brinesearch_google_route_receipts_issue97)<>9
     or (select count(*) from public.brinesearch_driver_google_routes_public)<>0 then
    raise exception 'Issue #97 ODOT hotfix installer requires reconciliation/publication zero';
  end if;
  select count(*)::integer,count(*) filter(where
    private_verification.brinesearch_issue97_dataset_scope_current(
      scope.dataset_id,scope.state_code,scope.county_code))::integer
  into v_required,v_current
  from public.brinesearch_road_source_dataset_counties scope
  join public.brinesearch_road_source_datasets dataset on dataset.id=scope.dataset_id
  where scope.active and scope.ingest_enabled and scope.required_for_graph
    and dataset.active and scope.state_code='OH';
  if v_required<>38 or v_current<>38 then
    raise exception 'Issue #97 ODOT hotfix installer requires Ohio source scopes 38/38 current';
  end if;
  if (select count(*) from public.brinesearch_road_graph_builds b
      where b.id='adfcc2c9-e9e9-463c-9f49-a2d2a329f1de'::uuid
        and b.graph_digest='d510e153634e51fa0966f2756598cd6c'
        and b.status='validated' and b.activated_at is null
        and private_verification.brinesearch_issue97_graph_build_release_current(b.id))<>1
     or (select count(*) from public.brinesearch_road_graph_builds b
      where b.id='1998882b-0874-40bc-befd-72e2ffabd9b4'::uuid
        and b.graph_digest='22bd977096f259de44ade8f636cfc4cd'
        and b.status='validated' and b.activated_at is null
        and private_verification.brinesearch_issue97_graph_build_release_current(b.id))<>1
     or exists(select 1 from public.brinesearch_road_graph_builds b
       where b.state_code='OH' and b.county_code='STA' and b.status='validated'
         and b.activated_at is null
         and private_verification.brinesearch_issue97_graph_build_release_current(b.id)) then
    raise exception 'Issue #97 ODOT hotfix installer canary checkpoint changed';
  end if;
end
\$gate\$;
SQL
)"

postflight_sql="$(cat <<SQL
do \$gate\$
begin
  if (select count(*) from supabase_migrations.schema_migrations
      where version in (${base_versions}))<>22
     or (select count(*) from supabase_migrations.schema_migrations
       where version='${migration_version}' and cardinality(statements)=1
         and name='${migration_name}')<>1 then
    raise exception 'Issue #97 ODOT hotfix installer expected base 22/22 plus exact hotfix 1/1';
  end if;
  if pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
     ))<>'06705f5b35a6d37151bb2c0dc5ade9bd'
     or private_verification.brinesearch_issue97_active_graph_release_generation()
       <>'issue97-release-20260815-r2' then
    raise exception 'Issue #97 ODOT hotfix installer final builder/generation mismatch';
  end if;
  if not private_verification.brinesearch_issue97_graph_build_release_current(
       '44d1d8dd-9f1f-4455-bd14-739f933c78ee'::uuid)
     or private_verification.brinesearch_issue97_graph_build_release_current(
       'adfcc2c9-e9e9-463c-9f49-a2d2a329f1de'::uuid)
     or private_verification.brinesearch_issue97_graph_build_release_current(
       '1998882b-0874-40bc-befd-72e2ffabd9b4'::uuid) then
    raise exception 'Issue #97 ODOT hotfix installer OHI/canary generation boundary failed';
  end if;
  if public.brinesearch_issue97_cutover_active()
     or exists(select 1 from public.brinesearch_road_graph_builds where status='staging')
     or (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)<>0
     or (select count(*) from public.brinesearch_driver_google_routes_public)<>0 then
    raise exception 'Issue #97 ODOT hotfix installer changed forbidden rollout state';
  end if;
end
\$gate\$;
SQL
)"

status_sql="$(cat <<SQL
select pg_catalog.jsonb_build_object(
  'builder_md5',pg_catalog.md5(pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure)),
  'active_generation',private_verification.brinesearch_issue97_active_graph_release_generation(),
  'base_versions_installed',(select count(*) from supabase_migrations.schema_migrations
    where version in (${base_versions})),
  'hotfix_installed',(select count(*) from supabase_migrations.schema_migrations
    where version='${migration_version}'),
  'cutover_active',public.brinesearch_issue97_cutover_active(),
  'staging_count',(select count(*) from public.brinesearch_road_graph_builds where status='staging'),
  'builder_sessions',(select count(*) from pg_catalog.pg_stat_activity activity
    where activity.pid<>pg_catalog.pg_backend_pid()
      and activity.state in ('active','idle in transaction','idle in transaction (aborted)')
      and activity.query ilike '%brinesearch_issue97_rebuild_county_graph%'),
  'ohi_release_current',private_verification.brinesearch_issue97_graph_build_release_current(
    '44d1d8dd-9f1f-4455-bd14-739f933c78ee'::uuid),
  'nob_r1_release_current',private_verification.brinesearch_issue97_graph_build_release_current(
    'adfcc2c9-e9e9-463c-9f49-a2d2a329f1de'::uuid),
  'bel_r1_release_current',private_verification.brinesearch_issue97_graph_build_release_current(
    '1998882b-0874-40bc-befd-72e2ffabd9b4'::uuid)
)::text;
SQL
)"

main() {
  local before after sql_file log_file rc after_rc
  [[ $# -eq 0 ]] || die "ODOT canonical production installer accepts no arguments"
  require_repo_checkpoint
  require_connection_profile
  verify_file
  run_psql --command="${preflight_sql}" >/dev/null
  before="$(run_psql --tuples-only --no-align --quiet --command="${protected_snapshot_sql}")"
  [[ -n "${before}" ]] || die "failed to capture protected before snapshot"

  umask 077
  mkdir -p "${log_dir}"
  sql_file="$(mktemp "${TMPDIR:-/tmp}/issue97-odot-canonical-install.XXXXXX.sql")"
  log_file="${log_dir}/$(date -u +%Y%m%dT%H%M%SZ)-odot-canonical-install.log"
  trap 'if [[ -n "${sql_file:-}" ]]; then rm -f -- "${sql_file}"; fi' EXIT
  {
    printf '\\set ON_ERROR_STOP on\n'
    printf 'begin;\n'
    printf "set local statement_timeout='15min';\n"
    printf "set local lock_timeout='2min';\n"
    printf '\\echo Installing %s\n' "${migration_file}"
    sed 's/\r$//' "${repo_root}/${migration_file}"
    printf '\n'
    printf "insert into supabase_migrations.schema_migrations(version,statements,name) values ('%s',ARRAY[\$%s\$" \
      "${migration_version}" "${history_tag}"
    sed 's/\r$//' "${repo_root}/${migration_file}"
    printf "\$%s\$]::text[],'%s');\n" "${history_tag}" "${migration_name}"
    printf 'do $verify$ begin\n'
    printf "  if pg_catalog.md5(pg_catalog.pg_get_functiondef('public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure))<>'06705f5b35a6d37151bb2c0dc5ade9bd' then raise exception 'Issue #97 exact hotfix installer builder mismatch'; end if;\n"
    printf "  if private_verification.brinesearch_issue97_active_graph_release_generation()<>'issue97-release-20260815-r2' then raise exception 'Issue #97 exact hotfix installer generation mismatch'; end if;\n"
    printf "  if (select count(*) from supabase_migrations.schema_migrations where version='${migration_version}')<>1 then raise exception 'Issue #97 exact hotfix installer history mismatch'; end if;\n"
    printf 'end $verify$;\n'
    printf 'commit;\n'
  } > "${sql_file}"

  printf 'ODOT canonical production install log: %s\n' "${log_file}"
  set +e
  run_psql --file="${sql_file}" > "${log_file}" 2>&1
  rc=$?
  set -e
  if [[ -r "${log_file}" ]]; then
    while IFS= read -r line || [[ -n "${line}" ]]; do printf '%s\n' "${line}"; done < "${log_file}"
  fi
  if [[ "${rc}" -ne 0 ]]; then
    after="$(run_psql --tuples-only --no-align --quiet --command="${protected_snapshot_sql}" 2>/dev/null || true)"
    printf 'Fresh one-shot server status (NO RETRY):\n' >&2
    run_psql --tuples-only --no-align --quiet --command="${status_sql}" >&2 || true
    if [[ -n "${after}" && "${after}" == "${before}" ]]; then
      printf 'Fresh protected after-snapshot matched before-snapshot exactly.\n' >&2
    else
      printf 'Fresh protected after-snapshot did not prove exact before/after equality.\n' >&2
    fi
    die "ODOT canonical installer failed; do not retry"
  fi

  set +e
  after="$(run_psql --tuples-only --no-align --quiet --command="${protected_snapshot_sql}" 2>/dev/null)"
  after_rc=$?
  set -e
  if [[ "${after_rc}" -ne 0 || -z "${after}" || "${after}" != "${before}" ]]; then
    printf 'Fresh one-shot server status after successful transaction snapshot failure (NO RETRY):\n' >&2
    run_psql --tuples-only --no-align --quiet --command="${status_sql}" >&2 || true
    if [[ -n "${after}" && "${after}" == "${before}" ]]; then
      printf 'Fresh protected after-snapshot matched before-snapshot exactly.\n' >&2
    else
      printf 'Fresh protected after-snapshot did not prove exact before/after equality.\n' >&2
    fi
    die "install committed but fresh protected-state equality was not proven; stop before canaries"
  fi
  if ! run_psql --command="${postflight_sql}" >/dev/null; then
    printf 'Fresh one-shot server status after committed postflight failure (NO RETRY):\n' >&2
    run_psql --tuples-only --no-align --quiet --command="${status_sql}" >&2 || true
    die "hotfix committed but fresh postflight failed; stop before canaries"
  fi
  rm -f -- "${sql_file}"
  trap - EXIT
  printf 'PASS: exact-one ODOT canonical hotfix installed atomically with matching migration history; r2 active; OHI current; r1 NOB/BEL canaries stale; protected production state unchanged.\n'
}

main "$@"
