import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const need = (source, token, label = token) =>
  assert.ok(source.includes(token), `Issue #97 VIN performance audit missing ${label}`);
const forbid = (source, token, label = token) =>
  assert.ok(!source.includes(token), `Issue #97 VIN performance audit forbids ${label}`);
const count = (source, token) => source.split(token).length - 1;
const bash = process.env.BRINESEARCH_BASH ?? "bash";

const migration = read("supabase/migrations/20260816090000_issue97_vin_endpoint_index_performance.sql");
const preflight = read("ops/issue97-computer-rollout/sql/17-release-preflight.sql");
const darkPlan = read("ops/issue97-computer-rollout/sql/14-dark-build-plan.sql");
const mappingContract = read("supabase/migrations/20260812046600_issue97_graph_mapping_semantic_fingerprint.sql");
const rehearsalPath = path.join(root, "ops/issue97-computer-rollout/issue97-vin-endpoint-index-rehearsal.sh");
const installerPath = path.join(root, "ops/issue97-computer-rollout/issue97-vin-endpoint-index-install.sh");
const rehearsal = fs.readFileSync(rehearsalPath, "utf8");
const installer = fs.readFileSync(installerPath, "utf8");

for (const scriptPath of [rehearsalPath, installerPath]) {
  execFileSync(bash, ["-n", scriptPath], { stdio: "pipe" });
}

for (const token of [
  "20260816090000",
  "06705f5b35a6d37151bb2c0dc5ade9bd",
  "issue97-release-20260815-r2",
  "create index brinesearch_supp_vin_start_geog_issue97_idx",
  "create index brinesearch_supp_vin_end_geog_issue97_idx",
  "extensions.st_startpoint(extensions.st_linemerge(geom))::extensions.geography",
  "extensions.st_endpoint(extensions.st_linemerge(geom))::extensions.geography",
  "where active and state_code='OH' and county_code='VIN'",
  "5420c208-163b-4514-9b34-0a1a96a43e47",
  "e9f4ed56bb2b1308b8b9913a751c78f5",
  "00c7ac96038083e8765439bcf1c034b2",
  "a2a49ac4f11baa703f05a493cf331c35",
  "exact 17 inactive r2 / 16 current checkpoint",
  "county_code in ('VIN','WAS')",
  "not private_verification.brinesearch_issue97_graph_build_release_current(build.id)",
  "brinesearch_issue97_graph_mapping_evidence",
]) need(migration, token);
assert.equal(count(migration, "create index brinesearch_supp_vin_"), 2,
  "VIN migration must create exactly two VIN-scoped indexes");
assert.equal(count(migration, "where active and state_code='OH' and county_code='VIN';"), 2,
  "both VIN endpoint indexes must use the exact county-scoped predicate");

for (const forbidden of [
  "create or replace function",
  "alter function",
  "update public.brinesearch_road_graph_builds",
  "insert into public.brinesearch_road_graph_builds",
  "delete from public.brinesearch_road_graph_builds",
  "update public.brinesearch_road_identity_mappings",
  "insert into public.brinesearch_road_identity_mappings",
  "delete from public.brinesearch_road_identity_mappings",
  "st_dwithin",
  "similarity(",
  "<->",
  "nearest_road",
  "name_used_for_mapping",
  "brinesearch_issue97_activate_graph_build(",
  "brinesearch_issue97_activate_cutover(",
  "brinesearch_issue97_refresh_saved_road_reconciliation(",
  "brinesearch_issue97_refresh_google_routes(",
]) forbid(migration.toLowerCase(), forbidden, `migration mutation/weakening surface ${forbidden}`);

for (const token of [
  "version='20260816090000'",
  "brinesearch_supp_vin_start_geog_issue97_idx",
  "brinesearch_supp_vin_end_geog_issue97_idx",
  "(st_startpoint(st_linemerge(geom)))::geography",
  "(st_endpoint(st_linemerge(geom)))::geography",
  "(active AND (state_code = ''OH''::text) AND (county_code = ''VIN''::text))",
]) need(preflight, token, `release preflight ${token}`);

for (const token of [
  "mapping_snapshot_digest",
  "brinesearch_issue97_graph_mapping_evidence",
  "fresh.mapping_current",
]) need(darkPlan, token, `CAR fail-closed dark-plan contract ${token}`);
for (const token of [
  "then p_evidence-'refresh_scope'",
  "generic route fingerprints remain unchanged",
]) need(mappingContract, token, `mapping evidence contract ${token}`);

for (const [source, label] of [[rehearsal, "rehearsal"], [installer, "installer"]]) {
  for (const token of [
    "20260816090000_issue97_vin_endpoint_index_performance.sql",
    "migration_version=\"20260816090000\"",
    "migration_name=\"issue97_vin_endpoint_index_performance\"",
    "history_tag=\"issue97_migration_20260816090000\"",
    "06705f5b35a6d37151bb2c0dc5ade9bd",
    "00c7ac96038083e8765439bcf1c034b2",
    "a2a49ac4f11baa703f05a493cf331c35",
    "set local statement_timeout='10min'",
    "set local lock_timeout='2min'",
    "PGSERVICE",
    "brinesearch_issue97_prod",
    "do not use PGPASSWORD",
    "insert into supabase_migrations.schema_migrations(version,statements,name)",
    "sed 's/\\r$//' \"${repo_root}/${migration_file}\"",
    "run_psql --file=\"${sql_file}\"",
    "Fresh one-shot server status",
    "NO RETRY",
  ]) need(source, token, `${label} ${token}`);
  for (const forbidden of [
    "supabase db push",
    "supabase migration up",
    "migration repair",
    "| tee ",
    "PGPASSWORD=",
    "DATABASE_URL=",
    "select public.brinesearch_issue97_rebuild_county_graph(",
    "brinesearch_issue97_activate_graph_build(",
    "brinesearch_issue97_activate_cutover(",
    "brinesearch_issue97_refresh_saved_road_reconciliation(",
    "brinesearch_issue97_refresh_google_routes(",
    "brinesearch_issue97_run_all_pad",
  ]) forbid(source, forbidden, `${label} unsafe surface ${forbidden}`);
  assert.equal(count(source, "migration_file=\"supabase/migrations/"), 1,
    `${label} must allowlist exactly one migration file`);
  assert.equal(count(source, "run_psql --file=\"${sql_file}\""), 1,
    `${label} must execute the assembled transaction exactly once`);
  const executeMigration = source.indexOf("sed 's/\\r$//' \"${repo_root}/${migration_file}\"");
  const recordHistory = source.indexOf("insert into supabase_migrations.schema_migrations(version,statements,name)");
  assert.ok(executeMigration >= 0 && recordHistory > executeMigration,
    `${label} must execute the normalized migration before recording history`);
}

need(rehearsal, "rollback;", "explicit rehearsal rollback");
forbid(rehearsal, "commit;", "rehearsal commit");
need(rehearsal, "fresh after-snapshot matched before-snapshot exactly", "rollback equality proof");
need(installer, "commit;", "explicit installer commit");
assert.equal(count(rehearsal, "printf 'begin;\\n'"), 1, "rehearsal must assemble one BEGIN");
assert.equal(count(rehearsal, "printf 'rollback;\\n'"), 1, "rehearsal must assemble one ROLLBACK");
assert.equal(count(installer, "printf 'begin;\\n'"), 1, "installer must assemble one BEGIN");
assert.equal(count(installer, "printf 'commit;\\n'"), 1, "installer must assemble one COMMIT");

console.log("Issue #97 VIN endpoint-index performance, exact CAR fail-closed currentness, exact-one rollback/installer and unchanged-builder audit passed.");
