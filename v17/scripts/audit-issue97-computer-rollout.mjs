import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const migration = read(
  "supabase/migrations/20260813174828_issue97_google_route_dispatcher_policy_readiness.sql"
);
const performanceMigration = read(
  "supabase/migrations/20260814074500_issue97_graph_builder_temp_geography_index.sql"
);
const shell = read(
  "ops/issue97-computer-rollout/issue97-computer-rollout.sh"
);
const preflight = read("ops/issue97-computer-rollout/sql/00-preflight.sql");
const build = read("ops/issue97-computer-rollout/sql/10-build-county.sql");
const verify = read("ops/issue97-computer-rollout/sql/11-verify-county.sql");
const status = read("ops/issue97-computer-rollout/sql/12-county-status.sql");
const ohi = read("ops/issue97-computer-rollout/sql/13-verify-ohi-thrush.sql");
const directions = read("ops/issue97-computer-rollout/sql/30-directions-dark-batch.sql");
const report = read("ops/issue97-computer-rollout/sql/31-directions-report.sql");
const security = read("supabase/tests/issue97_schema_security.sql");
const pkg = JSON.parse(read("package.json"));

const need = (source, token, label = token) =>
  assert.ok(source.includes(token), `Issue #97 computer rollout audit missing ${label}`);
const forbid = (source, token, label = token) =>
  assert.ok(!source.includes(token), `Issue #97 computer rollout audit forbids ${label}`);
const count = (source, token) => source.split(token).length - 1;

for (const token of [
  "drop policy if exists brinesearch_driver_google_routes_public_read_issue97",
  "using (public.brinesearch_issue97_google_route_current(pad_id))",
  "brinesearch_issue97_google_route_current_published_core(uuid)",
  "d.refobjid=v_dispatcher",
  "d.refobjid=v_core",
  "Issue #97 policy repair changed cutover or route data",
  "p.polpermissive",
  "release-state singleton is missing or duplicated",
  "from public,anon,authenticated,service_role",
]) need(migration, token);
assert.equal(
  count(migration, "grant execute on function public.brinesearch_issue97_google_route_current(uuid)"),
  1,
  "Issue #97 dispatcher must have one explicit grant"
);
assert.equal(
  count(migration, "create policy brinesearch_driver_google_routes_public_read_issue97"),
  1,
  "Issue #97 dispatcher policy must be recreated exactly once"
);
forbid(migration, "update public.brinesearch_issue97_release_state", "cutover mutation");
forbid(migration, "insert into public.brinesearch_driver_google_routes_public", "route write");
forbid(migration, "delete from public.brinesearch_driver_google_routes_public", "route delete");

for (const token of [
  "c5d54a4d839df79eff99f4dfd4b0b780",
  "06c4b57ff9056b96137b9aaf4f4b856d",
  "pg_advisory_xact_lock",
  "v_definition is distinct from v_expected",
  "build_state_digest",
  "Issue #97 graph builder metadata or ACL changed",
  "Issue #97 temp geography migration changed graph or release state",
  "execute v_patched",
]) need(performanceMigration, token, `graph temp-geography migration ${token}`);
assert.equal(
  count(performanceMigration, "create index tmp_issue97_segments_geog_idx"),
  4,
  "temp geography migration must pin the index in patch and verification anchors"
);
assert.equal(
  count(
    performanceMigration,
    "on tmp_issue97_segments using gist((geom::extensions.geography));"
  ),
  4,
  "temp geography migration must pin the exact geography expression"
);
assert.equal(
  count(performanceMigration, "analyze tmp_issue97_segments;"),
  4,
  "temp geography migration must pin post-index temp-table statistics"
);
for (const token of [
  "brinesearch_issue97_activate_graph_build",
  "brinesearch_issue97_activate_cutover",
  "brinesearch_issue97_refresh_google_routes",
  "insert into public.brinesearch_road_",
  "update public.brinesearch_road_",
  "delete from public.brinesearch_road_",
]) forbid(performanceMigration, token, `temp geography migration semantic expansion ${token}`);

for (const token of [
  "expected_branch=\"data/issue-97-authoritative-road-junction-graph\"",
  "--no-psqlrc",
  "--set=ON_ERROR_STOP=1",
  "PGSERVICE",
  "[[ -z \"${PGPASSWORD+x}\" ]]",
  "export PGSSLMODE=\"require\"",
  "no retry will occur",
  "OH:BEL|OH:JEF|OH:NOB",
  "PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGOPTIONS PGCONNECT_TIMEOUT",
  "DATABASE_URL SUPABASE_DB_URL SUPABASE_DATABASE_URL",
  "directions-dark",
]) need(shell, token);
for (const token of ["eval ", "SUPABASE_DB_PASSWORD", "--command="])
  forbid(shell, token, `shell input surface ${token}`);

for (const source of [preflight, verify, status, ohi, report])
  need(source, "begin read only", "read-only transaction");
need(
  verify,
  "set local statement_timeout='15min'",
  "full shared-provenance verifier timeout"
);
for (const source of [build, directions]) need(source, "\\set ON_ERROR_STOP on");
for (const source of [preflight, build, verify, directions])
  forbid(source, "\\quit", "psql quit-code gate (PostgreSQL 17 ignores its argument)");
for (const [source, token] of [
  [preflight, "Issue #97 computer preflight failed; no write was attempted"],
  [build, "Issue #97 county build gate failed"],
  [verify, "Issue #97 county validated-dark verification failed"],
  [directions, "Issue #97 dark directions gate failed"],
]) need(source, token, `fail-closed SQL exception ${token}`);
for (const token of [
  "brinesearch_issue97_normalize_wvdot_membership_measure(text,double precision)",
  "brinesearch_issue97_wvdot_name_measure_contains(text,double precision,numeric,numeric)",
  "wvdot_float8_helpers_ready",
  "wvdot_float8_typed_calls_pass",
  "wvdot_float8_runtime",
  "0.14300003076286521::double precision",
  "0.1430001000001::double precision",
  "idle in transaction",
  "proc.provolatile='i'",
  "not proc.prosecdef",
  "proc.proconfig @> array['search_path=\"\"']",
  "builder_provenance_ready",
  "builder_provenance_contract",
  "06c4b57ff9056b96137b9aaf4f4b856d",
  "tmp_issue97_shared_segment_coverage",
  "exact_canonical_grid_line_intersection",
  "v.raw_source_measure::numeric",
  "n.source_measure::numeric",
  "(c.fraction*c.length_m)::numeric",
  "(choice.fraction*choice.source_length_m)::numeric",
  "not like '%fraction::numeric%'",
  "create index tmp_issue97_segments_geog_idx",
  "on tmp_issue97_segments using gist((geom::extensions.geography));",
  "analyze tmp_issue97_segments;",
  "brinesearch_issue97_authoritative_road_segments_internal",
  "has_table_privilege(",
  "pg_get_viewdef(",
  "'public.brinesearch_authoritative_road_segments'::pg_catalog.regclass",
]) need(preflight, token, `WVDOT/runtime/builder preflight ${token}`);
assert.equal(
  count(preflight, "06c4b57ff9056b96137b9aaf4f4b856d"),
  2,
  "preflight must pin the optimized builder in summary and final gate"
);
assert.equal(
  count(preflight, "create index tmp_issue97_segments_geog_idx"),
  2,
  "preflight must verify the geography index in summary and final gate"
);
assert.equal(
  count(preflight, "analyze tmp_issue97_segments;"),
  2,
  "preflight must verify temp-segment statistics in summary and final gate"
);

for (const token of [
  "provenance_integrity",
  "Validated graph measure/shared provenance integrity failed",
  "source_segment_keys_by_identity",
  "source_measure_normalized",
  "source_measure_conflict",
  "extensions.st_coveredby(",
  "shared_ranked as materialized",
  "choice_rank",
  "expected_chosen_segment_key",
  "expected_raw_source_measure",
  "shared_identities as materialized",
  "target_segments as materialized",
  "build_segments as materialized",
  "from target_segments segment",
  "join build_segments segment",
  "left join build_segments segment using(identity_id)",
  "expected_shared_cards as materialized",
  "private_verification.brinesearch_issue97_authoritative_road_segments_internal",
  "set transaction isolation level repeatable read",
  "\\set issue97_summary_pass false",
  "\\gset issue97_summary_",
  "Issue #97 county graph/digest/receipt summary failed",
  "external_segments as materialized",
  "select distinct on(segment.id)",
  "from target_segments target_segment",
  "cross join lateral (",
  "source.identity_id=shared.identity_id",
  "offset 0",
  "order by segment.id",
  "true as graph_integrity",
  "Fresh post-verification state check failed",
  "\\gset issue97_post_",
]) need(verify, token, `county provenance verification ${token}`);
assert.equal(
  count(verify, "extensions.st_dwithin("),
  1,
  "county provenance verification must reconstruct the county-boundary scope once"
);
assert.equal(
  count(
    verify,
    "private_verification.brinesearch_issue97_authoritative_road_segments_internal"
  ),
  2,
  "county provenance verification must scan the trusted normalized view only for target and external scope"
);
assert.equal(
  count(verify, "build_segments"),
  3,
  "county provenance verification must define and reuse one materialized builder scope"
);
assert.equal(
  count(verify, "from expected_shared"),
  2,
  "county provenance verification must aggregate cards once and scan expectations once"
);
assert.equal(
  count(verify, "select segment.id,segment.identity_id,segment.source_segment_key,"),
  3,
  "county provenance verification must keep spatial segment materialization narrow"
);
assert.equal(count(verify, "union all"), 1, "county provenance scope must have two disjoint arms");
forbid(verify, "select segment.*", "wide spatial segment materialization");
need(
  verify,
  "coalesce(pg_catalog.bool_or(expected.source_measure_conflict),false)",
  "non-null expected card conflict aggregate"
);
assert.equal(
  count(preflight, "has_table_privilege("),
  2,
  "preflight must guard internal-view SELECT privilege in summary and final gate"
);
assert.equal(
  count(preflight, "pg_get_viewdef("),
  4,
  "preflight must compare internal/public view definitions in summary and final gate"
);
const summaryBoundary = verify.indexOf("\\gset issue97_summary_");
assert.ok(summaryBoundary > 0, "county verifier summary boundary must exist");
const summaryPhase = verify.slice(0, summaryBoundary);
const deepPhase = verify.slice(summaryBoundary);
need(
  summaryPhase,
  "pg_catalog.md5(coalesce(pg_catalog.string_agg(",
  "fail-closed summary graph digest recomputation"
);
need(
  summaryPhase,
  "membership.approach_data ? 'raw_source_measure'",
  "fail-closed summary normalization receipt check"
);
forbid(deepPhase, "candidate_build.graph_digest", "duplicate deep graph digest scan");
forbid(
  deepPhase,
  "pg_catalog.md5(coalesce(pg_catalog.string_agg(",
  "duplicate deep graph digest recomputation"
);
forbid(
  deepPhase,
  "membership.approach_data ? 'raw_source_measure'",
  "duplicate deep normalization receipt scan"
);
const postBoundary = verify.lastIndexOf("-- Repeatable read keeps the deep reconstruction");
assert.ok(postBoundary > summaryBoundary, "fresh verifier postcheck boundary must exist");
const postPhase = verify.slice(postBoundary);
for (const token of [
  ":'issue97_summary_validated_build_id'::uuid",
  "build.status='validated' and build.activated_at is null",
  "latest.completed_at desc nulls last",
  "brinesearch_issue97_graph_build_sources_current(",
  "where status='staging'",
  "brinesearch_issue97_cutover_active()",
  "build.county_code in ('BEL','JEF','NOB')",
  "from pg_catalog.pg_stat_activity activity",
  "brinesearch_issue97_rebuild_county_graph",
]) need(postPhase, token, `fresh county postcheck ${token}`);
need(ohi, "\\ir 11-verify-county.sql", "OHI must run the exact county provenance verifier");
for (const token of [
  "extensions.geometrytype(junction.geom)='POINT'",
  "extensions.st_x(case",
  "extensions.st_y(case",
]) need(ohi, token, `Thrush point-geometry guard ${token}`);
assert.equal(count(ohi, "extensions.st_x("), 3, "Thrush verifier must have three X reads");
assert.equal(count(ohi, "extensions.st_x(case"), 3, "every Thrush X read must be CASE guarded");
assert.equal(count(ohi, "extensions.st_y("), 3, "Thrush verifier must have three Y reads");
assert.equal(count(ohi, "extensions.st_y(case"), 3, "every Thrush Y read must be CASE guarded");
forbid(ohi, "extensions.st_x(junction.geom)", "unguarded Thrush X read");
forbid(ohi, "extensions.st_y(junction.geom)", "unguarded Thrush Y read");

assert.equal(
  count(build, "public.brinesearch_issue97_rebuild_county_graph("),
  1,
  "county build must call the unchanged builder exactly once"
);
assert.equal(
  (build.match(/^set local statement_timeout='90min';$/gm) || []).length,
  1,
  "county build must have one finite 90-minute builder statement maximum"
);
assert.equal(
  (build.match(/^set local statement_timeout='15min';$/gm) || []).length,
  0,
  "county build must not retain an executable 15-minute whole-builder limit"
);
for (const token of [
  "begin;",
  "set local lock_timeout='2min'",
  "commit;",
  "brinesearch_road_graph_counties",
  "brinesearch_issue97_cutover_active()",
  "'OH:BEL','OH:JEF','OH:NOB'",
  "A current active/validated graph already exists; refusing duplicate build",
]) need(build, token);
for (const token of ["activate_graph_build", "activate_cutover", "refresh_google_routes"])
  forbid(build, token, `build semantic expansion ${token}`);
forbid(shell, "activate)", "generic activation command");
assert.ok(
  !fs.existsSync(path.join(root,"ops/issue97-computer-rollout/sql/20-activate-county.sql")),
  "Issue #97 computer handoff must not ship a generic activation SQL file"
);

for (const token of [
  "set local statement_timeout='60min'",
  "public.brinesearch_issue97_refresh_saved_road_reconciliation()",
  "public.brinesearch_issue97_run_all_pad_routing_pipeline_geometry_core(null)",
  "all_graphs_active_current",
  "where county.active and (",
]) need(directions, token);
for (const token of [
  "brinesearch_issue97_activate_cutover",
  "brinesearch_issue97_refresh_google_routes",
  "brinesearch_issue97_activate_graph_build",
]) forbid(directions, token, `dark direction scope ${token}`);

for (const token of [
  "WV:WVDOT:ROUTE_ID:3500895000000",
  "-80.7132635",
  "-80.7132025",
  "-80.7127235",
  "-80.7129895",
  "W Cardinal Ave",
  "Thrush Ave",
  "WV:WVDOT:SEGMENT:1774131",
  "WV:WVDOT:SEGMENT:1861464",
  "raw_source_measure",
  "name_only','fuzzy_name','nearest_road','route_number_only",
  "v_count<>4",
  "wv_wvdot_publication_lrs",
  "wv_wvdot_street_name_doh",
  "wv_wvdot_street_name_sams",
  "wv_wvdot_alternate_route_name",
  "'t_junction'::text",
  "'exact_authoritative_endpoint_on_interior'::text",
  "'exact_authoritative_source_vertex'::text",
  "expected(lng,lat,expected_type,expected_method,expected_keys)",
  "fixture.expected_method",
  "topology_supported",
  "membership.distance_along_road_m-membership.source_measure*1609.344",
  "fuzzy_matching_used",
  "chosen_source_segment_key",
  "exactly one inactive validated candidate and no active/staging generation",
  "\\ir 11-verify-county.sql",
]) need(ohi, token);
forbid(
  ohi,
  "OHI must have exactly one graph build at this checkpoint",
  "stale one-total-build history gate"
);
forbid(
  ohi,
  "junction.source_method<>'exact_authoritative_source_vertex'",
  "stale all-source-vertex Thrush proof assertion"
);
assert.ok(
  count(ohi, "junction.verification_status='verified'") >= 7,
  "Issue #97 positive Thrush assertions must exclude held junctions"
);

for (const token of [
  "brinesearch_issue97_google_route_current_published_core(uuid)",
  "pg_catalog.pg_depend",
  "dependency.refobjid=",
  "public Google-route policy is not bound only to the final dispatcher",
]) need(security, token);

for (const token of [
  "phase1_integrity",
  "rollout_complete",
  "ascent--cooper",
  "ascent--noelle",
  "eclipse--dale-yoder-unit",
  "swn--rayle-coal",
  "expand--rayle-coal-company",
]) need(report, token);

assert.equal(
  pkg.scripts["verify:issue97-computer-rollout"],
  "node v17/scripts/audit-issue97-computer-rollout.mjs",
  "Issue #97 computer rollout audit must be directly runnable"
);
assert.ok(
  pkg.scripts.build.includes("npm run verify:issue97-computer-rollout"),
  "Issue #97 computer rollout audit must run in the full build"
);

console.log("Issue #97 computer rollout/security audit passed.");
