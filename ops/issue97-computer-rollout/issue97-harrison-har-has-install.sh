#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
installer_library="ops/issue97-computer-rollout/issue97-terminal-private-access-install.sh"
installer_library_blob="a3d80f9d3812b1b11f37b7ea033ac77eaf916e5b"
[[ "$(git -C "${repo_root}" hash-object -- "${installer_library}")" == "${installer_library_blob}" ]] || {
  printf 'ERROR: reviewed installer library drifted\n' >&2
  exit 2
}
# shellcheck source=issue97-terminal-private-access-install.sh
source "${repo_root}/${installer_library}"

migration_file="supabase/migrations/20260817144432_issue97_harrison_har_has_wrong_geometry_repair.sql"
migration_version="20260817144432"
migration_name="issue97_harrison_har_has_wrong_geometry_repair"
migration_blob="ea447ba965f016ce176330042ea576741b2c2cc1"
canonical_bytes="26331"
canonical_md5="868651aec0e70afd0e1e635f638c9138"
canonical_sha256="ba4116e2ac359b4c2bcef1fb1c989a9178c8d70df3f095ab2a7935f0f49b7943"
renderer_file="v17/scripts/issue97-canonical-migration-sql.mjs"
renderer_blob="3ce646aa9ddfbdfa99ef18cf239bc6f98f24b063"
current_head=""
attempt_file=""
canonical_file=""
canonical_hex=""

require_secure_lane() {
  local variable_name
  [[ "${PGSERVICE:-}" == "brinesearch_issue97_prod" ]] ||
    die "PGSERVICE must be brinesearch_issue97_prod"
  [[ -z "${PGPASSWORD+x}" ]] || die "PGPASSWORD must not be set"
  for variable_name in PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGOPTIONS PGCONNECT_TIMEOUT \
    DATABASE_URL SUPABASE_DB_URL SUPABASE_DATABASE_URL; do
    [[ -z "${!variable_name+x}" ]] || die "${variable_name} must be unset; use PGSERVICE only"
  done
  [[ -x "${psql_bin}" ]] || die "reviewed PostgreSQL client is missing"
  export PGSSLMODE=require
}

require_exact_artifacts() {
  [[ -f "${repo_root}/${migration_file}" ]] || die "migration is missing"
  [[ -f "${repo_root}/${renderer_file}" ]] || die "canonical renderer is missing"
  [[ "$(git -C "${repo_root}" hash-object -- "${migration_file}")" == "${migration_blob}" ]] ||
    die "migration blob drifted"
  [[ "$(git -C "${repo_root}" hash-object -- "${renderer_file}")" == "${renderer_blob}" ]] ||
    die "canonical renderer blob drifted"
}

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
  require_secure_lane
  require_exact_artifacts
  mkdir -p "${log_dir}"
  attempt_file="${log_dir}/issue97-harrison-install.${current_head}.attempted"
  [[ ! -e "${attempt_file}" ]] || die "the one install attempt for this exact head was already consumed"
  export PGAPPNAME=brinesearch-issue97-harrison-install-only
  printf 'Repository checkpoint: %s @ %s\n' "${expected_branch}" "${current_head}"
}

prepare_canonical_sql() {
  local metadata key value seen_bytes=0 seen_md5=0 seen_sha=0 seen_hex=0
  canonical_file="$1"
  metadata="$(node "${repo_root}/${renderer_file}" render \
    "${repo_root}/${migration_file}" "${canonical_file}")" ||
    die "canonical renderer failed"
  while IFS='=' read -r key value; do
    case "${key}" in
      CANONICAL_BYTES)
        [[ "${value}" == "${canonical_bytes}" ]] || die "canonical byte count drifted"
        seen_bytes=1
        ;;
      CANONICAL_MD5)
        [[ "${value}" == "${canonical_md5}" ]] || die "canonical MD5 drifted"
        seen_md5=1
        ;;
      CANONICAL_SHA256)
        [[ "${value}" == "${canonical_sha256}" ]] || die "canonical SHA-256 drifted"
        seen_sha=1
        ;;
      CANONICAL_HEX)
        canonical_hex="${value}"
        seen_hex=1
        ;;
      *) die "canonical renderer returned unexpected metadata key ${key}" ;;
    esac
  done <<<"${metadata}"
  [[ "${seen_bytes}${seen_md5}${seen_sha}${seen_hex}" == "1111" ]] ||
    die "canonical renderer metadata is incomplete"
  [[ "${#canonical_hex}" -eq $((canonical_bytes * 2)) ]] || die "canonical hex length mismatch"
  [[ "$(git -C "${repo_root}" hash-object --no-filters -- "${canonical_file}")" == "${migration_blob}" ]] ||
    die "canonical output bytes do not equal reviewed migration blob"
}

lock_sql="$(cat <<'SQL'
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('brinesearch:issue97:ohio-state-release'));
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('brinesearch:issue97:all-pad-routing-pipeline',97));
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('brinesearch:issue97:route-corpus',97));
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('brinesearch:issue97:saved-road-reconciliation'));
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('brinesearch:issue97:mapping-refresh'));
SQL
)"

guard_sql="$(cat <<'SQL'
do $issue97_harrison_install_guard$
declare v_required integer; v_current integer;
begin
  if (select count(*) from supabase_migrations.schema_migrations
      where version='20260817144432')<>0 then
    raise exception 'Issue #97 Harrison migration must still be absent';
  end if;
  if (select count(*) from (values
        ('f0db4fa8-3900-4350-a31e-3d61128006f8'::uuid,'CHARCR00014**C|route:CR:14'),
        ('ebb77f8d-ed1b-4612-ae33-a0c0e64c0ae3'::uuid,'CHARCR00020**C|route:CR:20'),
        ('639b05f2-5dc6-4678-86bf-e7a0a775663b'::uuid,'CHARCR00030**C|route:CR:30'),
        ('7fe5f642-bfdc-4d5f-9f54-85f9b15af741'::uuid,'CHARCR00044**C|route:CR:44'),
        ('8da26948-222c-46ef-ac79-9d07ccd08c31'::uuid,'CHARCR00045**C|route:CR:45'),
        ('f9ee9c0b-290f-4ffe-a62b-a4d9a4b52965'::uuid,'CHARCR00060**C|route:CR:60'),
        ('8382d2bf-d427-4a91-9afa-641885c71533'::uuid,'CHARCR00502**C|route:CR:502'),
        ('c1eefe49-fe29-44fa-84b7-2cfe29180761'::uuid,'THARTR00225**C|route:TR:225'),
        ('1a1988a9-b0d5-4414-8abf-ebeda1ac1f32'::uuid,'MHARMR00373**C|street:jones'),
        ('ed00b321-3e61-4e84-bbcb-7497a1ae4b90'::uuid,'CHARCR00064**C|route:CR:64')
      ) target(road_id,old_source_record_id)
      join public.brinesearch_roads road on road.id=target.road_id
        and road.source_record_id=target.old_source_record_id
      where road.state='OH' and road.county='Harrison' and road.verification_status='verified'
        and not road.candidate_only and road.centerline_geojson is not null)<>10 then
    raise exception 'Issue #97 exact ten-row Harrison HAR precondition drifted';
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
       where state_code in ('WV','PA') and details->>'release_generation_key'='issue97-release-20260815-r2')
     or public.brinesearch_issue97_cutover_active()
     or (select count(*) from public.brinesearch_driver_google_routes_public)<>0
     or (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)<>0 then
    raise exception 'Issue #97 Harrison protected rollout precondition drifted';
  end if;
  if not exists(select 1 from public.brinesearch_road_graph_builds build
       where build.id='5ee5f97b-447f-41d3-946a-68a8b28d8367'
         and build.state_code='OH' and build.county_code='CAR' and build.status='active'
         and build.graph_digest='e9f4ed56bb2b1308b8b9913a751c78f5'
         and build.details->>'mapping_snapshot_digest'='a2a49ac4f11baa703f05a493cf331c35'
         and build.activated_at='2026-08-16 11:08:18.355674+00'::timestamptz)
     or not exists(select 1 from public.brinesearch_road_graph_builds build
       where build.id='542c35d5-a9ba-4b43-8a64-63a66f6b29e2'
         and build.state_code='OH' and build.county_code='HAS' and build.status='active'
         and build.graph_digest='1d8f6a52d2541e313932906f944b2f92'
         and build.details->>'mapping_snapshot_digest'='211361b9586652be5188687de7ee9af9'
         and build.activated_at='2026-08-16 11:08:18.355674+00'::timestamptz)
     or not private_verification.brinesearch_issue97_graph_build_release_current(
       '5ee5f97b-447f-41d3-946a-68a8b28d8367')
     or not private_verification.brinesearch_issue97_graph_build_release_current(
       '542c35d5-a9ba-4b43-8a64-63a66f6b29e2') then
    raise exception 'Issue #97 Harrison CAR/HAS exact graph precondition drifted';
  end if;
  if (select count(*) from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
      join public.brinesearch_route_prep route on route.id=receipt.route_prep_id
      join public.pads pad on pad.id=route.pad_id
      where pad.state='Ohio' and route.active and route.route_group in ('primary','alternate'))<>806 then
    raise exception 'Issue #97 Ohio route receipt precondition drifted';
  end if;
  select count(*)::integer,
    count(*) filter(where private_verification.brinesearch_issue97_dataset_scope_current(
      scope.dataset_id,scope.state_code,scope.county_code))::integer into v_required,v_current
  from public.brinesearch_road_source_dataset_counties scope
  join public.brinesearch_road_source_datasets dataset on dataset.id=scope.dataset_id and dataset.active
  where scope.active and scope.ingest_enabled and scope.required_for_graph and scope.state_code='OH';
  if v_required<>38 or v_current<>38 then
    raise exception 'Issue #97 Ohio source scopes drifted: %/%',v_current,v_required;
  end if;
  if exists(select 1 from pg_catalog.pg_stat_activity activity
    where activity.pid<>pg_catalog.pg_backend_pid()
      and activity.state in ('active','idle in transaction','idle in transaction (aborted)')
      and activity.application_name like 'brinesearch-issue97-%') then
    raise exception 'Issue #97 competing operational backend exists';
  end if;
end
$issue97_harrison_install_guard$;
SQL
)"

postflight_sql="$(cat <<'SQL'
do $issue97_harrison_install_postflight$
begin
  if (select count(*) from supabase_migrations.schema_migrations
      where version='20260817144432'
        and name='issue97_harrison_har_has_wrong_geometry_repair'
        and cardinality(statements)=1
        and pg_catalog.md5(statements[1])='868651aec0e70afd0e1e635f638c9138')<>1 then
    raise exception 'Issue #97 Harrison canonical migration history mismatch';
  end if;
  if exists(select 1 from public.brinesearch_roads road
      where road.id=any(array[
        '639b05f2-5dc6-4678-86bf-e7a0a775663b','8da26948-222c-46ef-ac79-9d07ccd08c31',
        '8382d2bf-d427-4a91-9afa-641885c71533','f0db4fa8-3900-4350-a31e-3d61128006f8',
        'ebb77f8d-ed1b-4612-ae33-a0c0e64c0ae3','7fe5f642-bfdc-4d5f-9f54-85f9b15af741',
        'f9ee9c0b-290f-4ffe-a62b-a4d9a4b52965','ed00b321-3e61-4e84-bbcb-7497a1ae4b90',
        '1a1988a9-b0d5-4414-8abf-ebeda1ac1f32','c1eefe49-fe29-44fa-84b7-2cfe29180761'
      ]::uuid[]) and (road.source_record_id like '%HAR%' or road.road_identity_key like 'official|%HAR%')) then
    raise exception 'Issue #97 Harrison HAR provenance remains after repair';
  end if;
  if (select count(*) from (values
      ('f0db4fa8-3900-4350-a31e-3d61128006f8'::uuid,'82d4acf0-4592-3c60-732f-ef07cb42796a'::uuid,'CHASCR00014**C|route:CR:14'),
      ('ebb77f8d-ed1b-4612-ae33-a0c0e64c0ae3','b0ec2efd-e511-2e2d-c481-eaf896757bbb','CHASCR00020**C|route:CR:20'),
      ('639b05f2-5dc6-4678-86bf-e7a0a775663b','83906bd8-9c10-e948-60e6-ed78a1ca34de','CHASCR00030**C|route:CR:30'),
      ('7fe5f642-bfdc-4d5f-9f54-85f9b15af741','100e158e-9b85-f169-ae1e-cbb88b9f18fa','CHASCR00044**C|route:CR:44'),
      ('8da26948-222c-46ef-ac79-9d07ccd08c31','dd89cc57-386f-5f4a-cd54-79c862bda433','CHASCR00045**C|route:CR:45'),
      ('f9ee9c0b-290f-4ffe-a62b-a4d9a4b52965','1a09df0d-e31b-52a9-1d1d-6434e02546f5','CHASCR00060**C|route:CR:60'),
      ('8382d2bf-d427-4a91-9afa-641885c71533','d2f9004d-3a70-a61c-30b1-6aca9b4b46d0','CHASCR00502**C|route:CR:502')
    ) target(road_id,identity_id,source_record_id)
    join public.brinesearch_roads road on road.id=target.road_id
      and road.source_record_id=target.source_record_id
      and road.road_identity_key='official|'||target.source_record_id
      and road.centerline_geojson=extensions.st_asgeojson(
        private_verification.brinesearch_issue97_authoritative_identity_geometry(target.identity_id),7)::jsonb
      and road.verification_status='verified' and not road.candidate_only
    join public.brinesearch_road_identity_mappings mapping on mapping.road_id=target.road_id
      and mapping.identity_id=target.identity_id and mapping.mapping_status='verified')<>7 then
    raise exception 'Issue #97 Harrison seven exact CR repair pairs mismatch';
  end if;
  if not exists(select 1 from public.brinesearch_roads road
      where road.id='c1eefe49-fe29-44fa-84b7-2cfe29180761'
        and road.source_record_id='THASTR00225**C|route:TR:225'
        and road.road_identity_key='official|THASTR00225**C|route:TR:225'
        and road.centerline_geojson=extensions.st_asgeojson(
          private_verification.brinesearch_issue97_authoritative_identity_geometry(
            'dbcc9da8-07cb-f054-68ca-debe2f8640fc'),7)::jsonb
        and road.verification_status='verified' and not road.candidate_only)
     or exists(select 1 from public.brinesearch_road_identity_mappings
       where road_id='c1eefe49-fe29-44fa-84b7-2cfe29180761' and mapping_status='verified') then
    raise exception 'Issue #97 Harrison TR-225 repaired/unmapped postcondition failed';
  end if;
  if (select count(*) from public.brinesearch_roads road
      where road.id=any(array[
        'ed00b321-3e61-4e84-bbcb-7497a1ae4b90','1a1988a9-b0d5-4414-8abf-ebeda1ac1f32'
      ]::uuid[]) and road.source_record_id is null and road.centerline_geojson is null
        and road.verification_status='needs_review' and road.candidate_only
        and road.geometry_status='not_loaded')<>2
     or exists(select 1 from public.brinesearch_road_identity_mappings
       where road_id=any(array[
         'ed00b321-3e61-4e84-bbcb-7497a1ae4b90','1a1988a9-b0d5-4414-8abf-ebeda1ac1f32'
       ]::uuid[]) and mapping_status='verified') then
    raise exception 'Issue #97 Harrison Jones/CR-64 quarantine postcondition failed';
  end if;
  if (select details->>'mapping_snapshot_digest' from public.brinesearch_road_graph_builds
      where id='5ee5f97b-447f-41d3-946a-68a8b28d8367')<>'e50ef5799abf04d16c2ecb79d4db0651'
     or (select details->>'mapping_snapshot_digest' from public.brinesearch_road_graph_builds
         where id='542c35d5-a9ba-4b43-8a64-63a66f6b29e2')<>'7d0561a0f32e7432880d4ad39e5e7109'
     or not private_verification.brinesearch_issue97_graph_build_release_current(
       '5ee5f97b-447f-41d3-946a-68a8b28d8367')
     or not private_verification.brinesearch_issue97_graph_build_release_current(
       '542c35d5-a9ba-4b43-8a64-63a66f6b29e2') then
    raise exception 'Issue #97 Harrison CAR/HAS currentness postcondition failed';
  end if;
  if (select count(*) from public.brinesearch_road_graph_builds
      where state_code='OH' and status='active')<>19
     or (select count(distinct activated_at) from public.brinesearch_road_graph_builds
         where state_code='OH' and status='active')<>1
     or (select min(activated_at) from public.brinesearch_road_graph_builds
         where state_code='OH' and status='active')<>
        '2026-08-16 11:08:18.355674+00'::timestamptz
     or exists(select 1 from public.brinesearch_road_graph_builds where status='staging')
     or public.brinesearch_issue97_cutover_active()
     or (select count(*) from public.brinesearch_driver_google_routes_public)<>0
     or (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)<>0 then
    raise exception 'Issue #97 Harrison protected rollout postcondition drifted';
  end if;
end
$issue97_harrison_install_postflight$;
SQL
)"

protected_snapshot_sql="$(cat <<SQL
select pg_catalog.jsonb_build_object(
  'reviewed_base',(${snapshot_sql%\;}),
  'roads',(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(road)::text,'|' order by road.id),''))
    from public.brinesearch_roads road),
  'mappings',(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(mapping)::text,'|' order by mapping.id),''))
    from public.brinesearch_road_identity_mappings mapping),
  'builds',(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(build)::text,'|' order by build.id),''))
    from public.brinesearch_road_graph_builds build),
  'migration_history',(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.version),''))
    from supabase_migrations.schema_migrations row_value),
  'candidates',(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.route_prep_step_id,row_value.identity_id,row_value.candidate_basis),''))
    from private_verification.brinesearch_route_occurrence_candidates_issue97 row_value)
)::text;
SQL
)"

status_sql="$(cat <<'SQL'
select pg_catalog.jsonb_build_object(
  'migration_rows',(select count(*) from supabase_migrations.schema_migrations where version='20260817144432'),
  'history_md5',(select pg_catalog.md5(statements[1]) from supabase_migrations.schema_migrations where version='20260817144432'),
  'har_rows',(select count(*) from public.brinesearch_roads where id=any(array[
    '639b05f2-5dc6-4678-86bf-e7a0a775663b','8da26948-222c-46ef-ac79-9d07ccd08c31',
    '8382d2bf-d427-4a91-9afa-641885c71533','f0db4fa8-3900-4350-a31e-3d61128006f8',
    'ebb77f8d-ed1b-4612-ae33-a0c0e64c0ae3','7fe5f642-bfdc-4d5f-9f54-85f9b15af741',
    'f9ee9c0b-290f-4ffe-a62b-a4d9a4b52965','ed00b321-3e61-4e84-bbcb-7497a1ae4b90',
    '1a1988a9-b0d5-4414-8abf-ebeda1ac1f32','c1eefe49-fe29-44fa-84b7-2cfe29180761'
  ]::uuid[]) and source_record_id like '%HAR%'),
  'repaired_rows',(select count(*) from public.brinesearch_roads where id=any(array[
    '639b05f2-5dc6-4678-86bf-e7a0a775663b','8da26948-222c-46ef-ac79-9d07ccd08c31',
    '8382d2bf-d427-4a91-9afa-641885c71533','f0db4fa8-3900-4350-a31e-3d61128006f8',
    'ebb77f8d-ed1b-4612-ae33-a0c0e64c0ae3','7fe5f642-bfdc-4d5f-9f54-85f9b15af741',
    'f9ee9c0b-290f-4ffe-a62b-a4d9a4b52965','c1eefe49-fe29-44fa-84b7-2cfe29180761'
  ]::uuid[]) and source_record_id like '%HAS%'),
  'car_graph',(select graph_digest from public.brinesearch_road_graph_builds where id='5ee5f97b-447f-41d3-946a-68a8b28d8367'),
  'car_mapping',(select details->>'mapping_snapshot_digest' from public.brinesearch_road_graph_builds where id='5ee5f97b-447f-41d3-946a-68a8b28d8367'),
  'car_activation',(select activated_at from public.brinesearch_road_graph_builds where id='5ee5f97b-447f-41d3-946a-68a8b28d8367'),
  'has_graph',(select graph_digest from public.brinesearch_road_graph_builds where id='542c35d5-a9ba-4b43-8a64-63a66f6b29e2'),
  'has_mapping',(select details->>'mapping_snapshot_digest' from public.brinesearch_road_graph_builds where id='542c35d5-a9ba-4b43-8a64-63a66f6b29e2'),
  'has_activation',(select activated_at from public.brinesearch_road_graph_builds where id='542c35d5-a9ba-4b43-8a64-63a66f6b29e2'),
  'receipts',(select count(*) from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
    join public.brinesearch_route_prep route on route.id=receipt.route_prep_id
    join public.pads pad on pad.id=route.pad_id where pad.state='Ohio' and route.active
      and route.route_group in ('primary','alternate')),
  'latest_receipt',(select max(receipt.updated_at)
    from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
    join public.brinesearch_route_prep route on route.id=receipt.route_prep_id
    join public.pads pad on pad.id=route.pad_id where pad.state='Ohio' and route.active
      and route.route_group in ('primary','alternate')),
  'public_google',(select count(*) from public.brinesearch_driver_google_routes_public),
  'cutover',public.brinesearch_issue97_cutover_active(),
  'staging',(select count(*) from public.brinesearch_road_graph_builds where status='staging'),
  'global_reconciliation',(select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)
)::text;
SQL
)"

render_transaction_sql() {
  local termination="$1"
  [[ "${termination}" == "commit" || "${termination}" == "rollback" ]] ||
    die "invalid transaction termination"
  printf '\\set ON_ERROR_STOP on\n'
  printf 'begin;\nset local statement_timeout='\''15min'\'';\nset local lock_timeout='\''2min'\'';\n'
  printf '%s\n%s\n' "${lock_sql}" "${guard_sql}"
  # Execute the exact canonical bytes. Shell interpolation never touches SQL.
  command cat -- "${canonical_file}"
  printf "\ninsert into supabase_migrations.schema_migrations(version,statements,name) values ('%s',array[pg_catalog.convert_from(pg_catalog.decode('%s','hex'),'UTF8')]::text[],'%s');\n" \
    "${migration_version}" "${canonical_hex}" "${migration_name}"
  printf '%s\n%s;\n' "${postflight_sql}" "${termination}"
}

main() {
  local before after sql_file log_file canonical_tmp rc after_rc start_utc end_utc
  require_checkpoint "$@"
  run_psql --command="begin read only; set local statement_timeout='15min'; set local lock_timeout='2min'; ${guard_sql} rollback;" >/dev/null
  before="$(run_psql --tuples-only --no-align --quiet --command="set statement_timeout='15min'; set lock_timeout='2min'; ${protected_snapshot_sql}")"
  [[ -n "${before}" ]] || die "protected before-snapshot is empty"

  umask 077
  sql_file="$(mktemp "${TMPDIR:-/tmp}/issue97-harrison-install.XXXXXX.sql")"
  canonical_tmp="$(mktemp "${TMPDIR:-/tmp}/issue97-harrison-canonical.XXXXXX.sql")"
  rm -f -- "${canonical_tmp}"
  trap 'rm -f -- "${sql_file:-}" "${canonical_tmp:-}"' EXIT
  prepare_canonical_sql "${canonical_tmp}"
  render_transaction_sql commit >"${sql_file}"
  log_file="${log_dir}/$(date -u +%Y%m%dT%H%M%SZ)-harrison-har-has-install.log"
  start_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'INSTALL_START_UTC=%s\nMIGRATION_VERSION=%s\nMIGRATION_NAME=%s\nMIGRATION_GIT_BLOB=%s\nCANONICAL_BYTES=%s\nCANONICAL_MD5=%s\nCANONICAL_SHA256=%s\n' \
    "${start_utc}" "${migration_version}" "${migration_name}" "${migration_blob}" \
    "${canonical_bytes}" "${canonical_md5}" "${canonical_sha256}" >"${log_file}"
  printf 'attempted_at=%s\nsha=%s\nlog=%s\n' "${start_utc}" "${current_head}" "${log_file}" >"${attempt_file}"
  printf 'Harrison production installation log: %s\n' "${log_file}"
  set +e
  run_psql --file="${sql_file}" >>"${log_file}" 2>&1
  rc=$?
  set -e
  end_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'INSTALL_END_UTC=%s\nCLIENT_EXIT_CODE=%s\n' "${end_utc}" "${rc}" >>"${log_file}"
  command cat -- "${log_file}"
  if [[ "${rc}" -ne 0 ]]; then
    printf 'Fresh one-shot server status after failed/ambiguous client result (NO RETRY):\n' >&2
    run_psql --tuples-only --no-align --quiet --command="${status_sql}" >&2 || true
    die "Harrison installer failed; do not retry"
  fi
  set +e
  after="$(run_psql --tuples-only --no-align --quiet --command="set statement_timeout='15min'; set lock_timeout='2min'; ${protected_snapshot_sql}" 2>/dev/null)"
  after_rc=$?
  set -e
  if [[ "${after_rc}" -ne 0 || -z "${after}" || "${after}" != "${before}" ]]; then
    printf 'Fresh one-shot server status after commit ambiguity (NO RETRY):\n' >&2
    run_psql --tuples-only --no-align --quiet --command="${status_sql}" >&2 || true
    die "Harrison installation may have committed but protected-state equality was not proven"
  fi
  run_psql --command="begin read only; set local statement_timeout='15min'; set local lock_timeout='2min'; ${postflight_sql} rollback;" >/dev/null ||
    die "committed Harrison install failed fresh postflight; do not retry"
  printf 'Protected before/after snapshots match exactly.\n'
  printf 'PASS: exact Harrison migration installed atomically once with canonical history bytes; no route refresh occurred.\n'
  rm -f -- "${sql_file}" "${canonical_tmp}"
  trap - EXIT
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
