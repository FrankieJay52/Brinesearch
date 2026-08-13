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
for (const source of [build, directions]) need(source, "\\set ON_ERROR_STOP on");
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
]) need(preflight, token, `WVDOT runtime preflight ${token}`);

assert.equal(
  count(build, "public.brinesearch_issue97_rebuild_county_graph("),
  1,
  "county build must call the unchanged builder exactly once"
);
for (const token of [
  "begin;",
  "set local statement_timeout='15min'",
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
  "membership.distance_along_road_m-membership.source_measure*1609.344",
  "fuzzy_matching_used",
  "chosen_source_segment_key",
]) need(ohi, token);
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
