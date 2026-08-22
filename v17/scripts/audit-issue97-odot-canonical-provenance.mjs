import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const need = (source, token, label = token) =>
  assert.ok(source.includes(token), `Issue #97 canonical ODOT audit missing ${label}`);
const forbid = (source, token, label = token) =>
  assert.ok(!source.includes(token), `Issue #97 canonical ODOT audit forbids ${label}`);
const count = (source, token) => source.split(token).length - 1;
const bash = process.env.BRINESEARCH_BASH ?? "bash";

const migration = read("supabase/migrations/20260815090000_issue97_odot_overlap_canonical_provenance.sql");
const preflight = read("ops/issue97-computer-rollout/sql/17-release-preflight.sql");
const verify = read("ops/issue97-computer-rollout/sql/19-verify-county-release.sql");
const nob = read("ops/issue97-computer-rollout/sql/21-verify-nob-leonard-release.sql");
const rehearsalPath = path.join(root, "ops/issue97-computer-rollout/issue97-odot-canonical-rehearsal.sh");
const installerPath = path.join(root, "ops/issue97-computer-rollout/issue97-odot-canonical-install.sh");
const rehearsal = fs.readFileSync(rehearsalPath, "utf8");
const installer = fs.readFileSync(installerPath, "utf8");
const offGridFixture = read("supabase/tests/issue97_odot_canonical_provenance.sql");
const darkCandidates = read("supabase/tests/issue97_dark_candidate_release.sql");
const schemaSecurity = read("supabase/tests/issue97_schema_security.sql");

for (const scriptPath of [rehearsalPath, installerPath]) {
  execFileSync(bash, ["-n", scriptPath], { stdio: "pipe" });
}

for (const token of [
  "e0528f257f3c1b6d40341b735f284f1d",
  "06705f5b35a6d37151bb2c0dc5ade9bd",
  "issue97-release-20260814-r1",
  "issue97-release-20260815-r2",
  "tmp_issue97_shared_segment_coverage coverage",
  "coverage.geom_key=s.geom_key",
  "coverage.identity_ids=s.identity_ids",
  "coverage.source_segment_id=pair.secondary_segment_id",
  "coverage.source_segment_key=pair.secondary_segment_key",
  "coverage.source_segment_id=pair.primary_segment_id",
  "coverage.source_segment_key=pair.primary_segment_key",
  "join tmp_issue97_target_segments target",
  "ODOT overlap provenance set mismatch",
  "using errcode='55000'",
  "primary key(build_id,generation_key)",
  "disable trigger brinesearch_issue97_graph_release_generation_immutable",
  "enable trigger brinesearch_issue97_graph_release_generation_immutable",
  "historical_build_rows_rewritten',false",
  "historical_release_receipt_fields_rewritten',false",
  "historical_qualification_rewritten',false",
  "persistent_odot_geometry_rewritten',false",
  "name_or_nearest_matching_used',false",
  "2025_000000000270433->2025_000000000269543",
  "generation_table.relacl",
  "generation_table.relforcerowsecurity",
  "qualification_table.relacl",
  "qualification_table.relforcerowsecurity",
  "index_row.indisunique and index_row.indisvalid and index_row.indisready",
  "build.id::text||':'||pg_catalog.to_jsonb(build)::text",
  "where build.details->>'release_generation_key'='issue97-release-20260815-r2'",
]) need(migration, token);
assert.equal(count(migration, "in access exclusive mode;"), 2,
  "canonical ODOT migration must AccessExclusive-lock both release receipt tables");
for (const trigger of [
  "brinesearch_issue97_graph_release_generation_immutable",
  "brinesearch_issue97_graph_release_qualification_immutable",
]) {
  need(migration, trigger, `exact immutable trigger ${trigger}`);
}

const replacementBlocks = [...migration.matchAll(/v_new:=\$new\$([\s\S]*?)\$new\$;/g)]
  .map(match => match[1]);
assert.equal(replacementBlocks.length, 2, "canonical ODOT migration must have exactly two builder replacements");
forbid(replacementBlocks[0], "extensions.st_intersects(pair.topology_geom,s.geom)", "raw pair/card intersection in provenance replacement");
forbid(replacementBlocks[0], "extensions.st_intersection(pair.topology_geom,s.geom)", "raw pair/card overlap in provenance replacement");
need(replacementBlocks[0], "coverage.source_segment_id=pair.secondary_segment_id");
need(replacementBlocks[0], "coverage.source_segment_id=pair.primary_segment_id");
need(replacementBlocks[1], "select * from expected except select * from observed");
need(replacementBlocks[1], "select * from observed except select * from expected");
for (const forbidden of ["similarity(", "<->", "nearest_road_used',true", "name_used',true"]) {
  forbid(replacementBlocks.join("\n"), forbidden, `guessed topology selector ${forbidden}`);
}

for (const token of [
  "issue97-release-20260815-r2",
  "06705f5b35a6d37151bb2c0dc5ade9bd",
  "20260815090000",
  "coverage.source_segment_id=pair.secondary_segment_id",
  "ODOT overlap provenance set mismatch",
]) need(preflight, token, `r2 preflight ${token}`);
for (const token of [
  "release_generation_key'='issue97-release-20260815-r2",
  "release_builder_md5'='06705f5b35a6d37151bb2c0dc5ade9bd",
  "secondary_source_segment_key",
  "primary_source_segment_key",
  "overlap_inverse_ind",
  "first_missing",
  "first_extra",
]) need(verify, token, `r2 county verifier ${token}`);
need(nob, "\\ir 19-verify-county-release.sql", "NOB must execute the universal ODOT pair gate");

for (const [source, label] of [[rehearsal, "rehearsal"], [installer, "installer"]]) {
  for (const token of [
    "20260815090000_issue97_odot_overlap_canonical_provenance.sql",
    "06705f5b35a6d37151bb2c0dc5ade9bd",
    "issue97-release-20260815-r2",
    "set local statement_timeout='15min'",
    "set local lock_timeout='2min'",
    "sed 's/\\r$//'",
    "PGSERVICE",
    "brinesearch_issue97_prod",
    "do not use PGPASSWORD",
    "migration_version=\"20260815090000\"",
    "migration_name=\"issue97_odot_overlap_canonical_provenance\"",
    "history_tag=\"issue97_migration_20260815090000\"",
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
    "20260814163050_issue97_odot_authoritative_overlap_shared_pavement.sql\"",
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
    `${label} must execute the normalized migration before recording its history row`);
}
need(rehearsal, "rollback;", "explicit rehearsal rollback");
forbid(rehearsal, "commit;", "rehearsal commit");
need(installer, "commit;", "explicit installer commit");
assert.equal(count(rehearsal, "printf 'begin;\\n'"), 1, "rehearsal must assemble one outer BEGIN");
assert.equal(count(rehearsal, "printf 'rollback;\\n'"), 1, "rehearsal must assemble one explicit ROLLBACK");
assert.equal(count(installer, "printf 'begin;\\n'"), 1, "installer must assemble one outer BEGIN");
assert.equal(count(installer, "printf 'commit;\\n'"), 1, "installer must assemble one explicit COMMIT");
need(rehearsal, "fresh after-snapshot", "fresh rollback equality report");
need(installer, "Fresh protected after-snapshot", "fresh failure equality report");

for (const token of [
  "raw/card mismatch",
  "2025_000000000270433",
  "2025_000000000269543",
  "'PRIMARY_OVERLAP_ID','2025_000000000269543'",
  "primary_segment.source_record_id=secondary.attributes->>'PRIMARY_OVERLAP_ID'",
  "direct snapped distance 0 / line overlap 0",
  "extensions.st_snaptogrid(pair.topology_geom,0.0000001)",
  "tmp_issue97_fixture_working_segments",
  "set geom=pair.topology_geom",
  "extensions.st_snaptogrid(segment.geom,0.0000001)",
  "coverage.source_segment_id=pair.secondary_segment_id",
  "coverage.source_segment_id=pair.primary_segment_id",
  "exact canonical source coverage pair set changed",
  "select * from expected except select * from observed",
  "select * from observed except select * from expected",
  "rewrote persistent secondary geometry",
  "rollback;",
]) need(offGridFixture, token, `off-grid fixture ${token}`);
for (const token of [
  "select * from expected except select * from observed",
  "select * from observed except select * from expected",
  "current Ohio candidates have ODOT pair-set mismatch",
  "secondary_source_segment_key",
  "overlap_inverse_ind",
]) need(darkCandidates, token, `dark-candidate ODOT gate ${token}`);
for (const token of [
  "PRIMARY KEY (build_id, generation_key)",
  "issue97-release-20260815-r2",
  "06705f5b35a6d37151bb2c0dc5ade9bd",
  "t.tgenabled='O'",
]) need(schemaSecurity, token, `r2 schema security ${token}`);

console.log("Issue #97 canonical-grid ODOT provenance, fail-closed exact pair equality, r2 receipt transition, exact-one rehearsal/installer and rollout pin audit passed.");
