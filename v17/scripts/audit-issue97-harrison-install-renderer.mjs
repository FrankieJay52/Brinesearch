import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeMigrationSql, migrationSqlEvidence } from "./issue97-canonical-migration-sql.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const migrationPath = path.join(root,
  "supabase/migrations/20260817144432_issue97_harrison_har_has_wrong_geometry_repair.sql");
const installerPath = path.join(root,
  "ops/issue97-computer-rollout/issue97-harrison-har-has-install.sh");
const rehearsalPath = path.join(root,
  "ops/issue97-computer-rollout/issue97-harrison-har-has-rehearsal.sh");
const migration = fs.readFileSync(migrationPath);
const installer = fs.readFileSync(installerPath, "utf8").replace(/\r\n?/g, "\n");
const rehearsal = fs.readFileSync(rehearsalPath, "utf8").replace(/\r\n?/g, "\n");

const md5 = value => crypto.createHash("md5").update(value).digest("hex");
const sampleLf = Buffer.from("select 1;\n-- exact SQL\n", "utf8");
const sampleCrlf = Buffer.from("select 1;\r\n-- exact SQL\r\n", "utf8");
const sampleNoFinal = Buffer.from("select 1;\n-- exact SQL", "utf8");
const sampleManyFinal = Buffer.from("select 1;\n-- exact SQL\n\n\n", "utf8");
const canonicalSample = canonicalizeMigrationSql(sampleLf);

assert.deepEqual(canonicalizeMigrationSql(sampleCrlf), canonicalSample,
  "CRLF and LF must canonicalize identically");
assert.deepEqual(canonicalizeMigrationSql(sampleNoFinal), canonicalSample,
  "missing terminal newline must canonicalize deterministically");
assert.deepEqual(canonicalizeMigrationSql(sampleManyFinal), canonicalSample,
  "multiple terminal newlines must canonicalize to one");
assert.throws(() => canonicalizeMigrationSql(Buffer.from("select 1;\rselect 2;\n")),
  /bare carriage return/, "bare CR must fail closed");
assert.throws(() => canonicalizeMigrationSql(Buffer.from([0xef, 0xbb, 0xbf, 0x73])),
  /BOM/, "UTF-8 BOM must fail closed");

const semanticChange = canonicalizeMigrationSql(Buffer.from("select 2;\n-- exact SQL\n"));
assert.notEqual(md5(semanticChange), md5(canonicalSample),
  "an executable SQL change must change the digest");
const interiorWhitespaceChange = canonicalizeMigrationSql(Buffer.from("select  1;\n-- exact SQL\n"));
assert.notEqual(md5(interiorWhitespaceChange), md5(canonicalSample),
  "interior SQL bytes must not be normalized away");

const migrationEvidence = migrationSqlEvidence(migration);
assert.equal(migrationEvidence.md5, "868651aec0e70afd0e1e635f638c9138",
  "reviewed Harrison migration canonical MD5 drifted");
assert.equal(migrationEvidence.canonical.compare(migration), 0,
  "reviewed LF/one-final-newline migration must already be canonical");

// Reproduce the failed 2026-08-17 installer serialization exactly: placing the
// opening dollar quote on its own line injected a leading LF into statements[1].
const failedStored = Buffer.concat([
  Buffer.from("\n"), migrationEvidence.canonical, Buffer.from("\n"),
]);
assert.notEqual(md5(failedStored), migrationEvidence.md5,
  "the failed leading-LF history serialization must reproduce a digest mismatch");
assert.equal(md5(failedStored), "5ec5ac7ad9cbcef6253a762fede0f393",
  "failed leading/trailing-LF serialization fingerprint drifted");

for (const token of [
  "issue97-canonical-migration-sql.mjs", "CANONICAL_MD5", "CANONICAL_HEX",
  "convert_from(pg_catalog.decode", "868651aec0e70afd0e1e635f638c9138",
  "cardinality(statements)=1", "pg_catalog.md5(statements[1])",
]) assert.ok(installer.includes(token), `installer missing canonical renderer contract: ${token}`);
for (const token of [
  "issue97-harrison-har-has-install.sh", "prepare_canonical_sql",
  "render_transaction_sql rollback", "rollback rehearsal changed durable production state",
]) assert.ok(rehearsal.includes(token), `rehearsal missing canonical renderer reuse: ${token}`);
for (const [source, label] of [[installer, "installer"], [rehearsal, "rehearsal"]]) {
  assert.ok(!source.includes("$issue97_migration_20260817144432$"),
    `${label} must not use newline-sensitive dollar-quoted history serialization`);
  assert.ok(!source.includes("brinesearch_oh_county_code"),
    `${label} must not use the stale county helper`);
}

assert.ok(installer.includes("render_transaction_sql commit"),
  "installer must render the fixed commit transaction");
for (const token of [
  "protected_invariants_sql",
  "non_target_roads",
  "builds_except_authorized_mapping_receipts",
  "migration_history_except_harrison",
  "#- '{details,mapping_snapshot_digest}'",
  "#- '{details,mapping_snapshot_upgrade_reason}'",
  "#- '{details,mapping_snapshot_upgrade_proof}'",
  "route_receipts",
  "occurrence_receipts",
  "transition_receipts",
  "geometry_receipts",
  "private_google_receipts",
  "public_google_routes",
  "junctions",
  "memberships",
  "anchors",
  "source_scopes",
  "release_state",
  "saved_road_reconciliation_runs",
  "exact normalized ten-road outcomes drifted",
  "pg_catalog.to_jsonb(road)-'geometry_checked_at'-'updated_at'",
  "prior_mapping_snapshot_digest",
  "new_mapping_snapshot_digest",
  "graph_digest_recomputed",
  "membership_current_mapping_mismatch_count",
  "Ohio route receipt postcondition drifted",
  "Ohio source-scope postcondition drifted",
  "expected-delta protected invariants",
]) assert.ok(installer.includes(token), `installer missing expected-delta invariant: ${token}`);
assert.ok(!installer.includes("protected_snapshot_sql"),
  "installer must not retain the false whole-database snapshot comparison");

const authorizedBuildIds = new Set([
  "5ee5f97b-447f-41d3-946a-68a8b28d8367",
  "542c35d5-a9ba-4b43-8a64-63a66f6b29e2",
]);
const expectedBuildReceipts = new Map([
  ["5ee5f97b-447f-41d3-946a-68a8b28d8367", {
    mapping_snapshot_digest: "e50ef5799abf04d16c2ecb79d4db0651",
    mapping_snapshot_upgrade_reason: "harrison_har_to_has_wrong_geometry_repair",
    mapping_snapshot_upgrade_proof: {
      prior_mapping_snapshot_digest: "a2a49ac4f11baa703f05a493cf331c35",
      new_mapping_snapshot_digest: "e50ef5799abf04d16c2ecb79d4db0651",
      topology_changed: false,
      source_run_vector_unchanged: true,
      graph_digest_recomputed: "e9f4ed56bb2b1308b8b9913a751c78f5",
      point_junction_count: 2522,
      shared_segment_count: 90,
      membership_count: 5251,
      bad_anchor_count: 0,
      membership_current_mapping_mismatch_count: 0,
      repair_scope: "ten frozen Harrison HAR-contaminated Road Manager rows",
    },
  }],
  ["542c35d5-a9ba-4b43-8a64-63a66f6b29e2", {
    mapping_snapshot_digest: "7d0561a0f32e7432880d4ad39e5e7109",
    mapping_snapshot_upgrade_reason: "harrison_har_to_has_wrong_geometry_repair",
    mapping_snapshot_upgrade_proof: {
      prior_mapping_snapshot_digest: "211361b9586652be5188687de7ee9af9",
      new_mapping_snapshot_digest: "7d0561a0f32e7432880d4ad39e5e7109",
      topology_changed: false,
      source_run_vector_unchanged: true,
      graph_digest_recomputed: "1d8f6a52d2541e313932906f944b2f92",
      point_junction_count: 1746,
      shared_segment_count: 57,
      membership_count: 3550,
      bad_anchor_count: 0,
      membership_current_mapping_mismatch_count: 0,
      repair_scope: "ten frozen Harrison HAR-contaminated Road Manager rows",
    },
  }],
]);
const normalizeBuild = value => {
  const build = structuredClone(value);
  if (authorizedBuildIds.has(build.id)) {
    delete build.details.mapping_snapshot_digest;
    delete build.details.mapping_snapshot_upgrade_reason;
    delete build.details.mapping_snapshot_upgrade_proof;
  }
  return build;
};
const invariantDigest = builds => md5(Buffer.from(JSON.stringify(
  builds.map(normalizeBuild).sort((a, b) => a.id.localeCompare(b.id)),
)));
const syntheticBefore = [
  { id: [...authorizedBuildIds][0], graph_digest: "graph-a", activated_at: "same",
    details: { mapping_snapshot_digest: "old-car", stable: "same" } },
  { id: [...authorizedBuildIds][1], graph_digest: "graph-has", activated_at: "same",
    details: { mapping_snapshot_digest: "old-has", stable: "same" } },
  { id: "00000000-0000-0000-0000-000000000001", graph_digest: "graph-b",
    details: { mapping_snapshot_digest: "non-target", stable: "same" } },
];
const authorizedAfter = structuredClone(syntheticBefore);
for (const build of authorizedAfter.filter(value => authorizedBuildIds.has(value.id))) {
  Object.assign(build.details, structuredClone(expectedBuildReceipts.get(build.id)));
}
assert.equal(invariantDigest(authorizedAfter), invariantDigest(syntheticBefore),
  "only the authorized CAR/HAS mapping receipt fields may be excluded");
const topologyMutation = structuredClone(authorizedAfter);
topologyMutation[0].graph_digest = "changed-graph";
assert.notEqual(invariantDigest(topologyMutation), invariantDigest(syntheticBefore),
  "an authorized build topology mutation must fail expected-delta equality");
const unrelatedMutation = structuredClone(authorizedAfter);
unrelatedMutation.find(build => !authorizedBuildIds.has(build.id))
  .details.mapping_snapshot_digest = "changed-unrelated";
assert.notEqual(invariantDigest(unrelatedMutation), invariantDigest(syntheticBefore),
  "an unrelated build mutation must fail expected-delta equality");
const activationMutation = structuredClone(authorizedAfter);
activationMutation[0].activated_at = "changed";
assert.notEqual(invariantDigest(activationMutation), invariantDigest(syntheticBefore),
  "an authorized build activation mutation must fail expected-delta equality");
const exactReceiptMatches = build =>
  JSON.stringify(build.details.mapping_snapshot_digest) ===
    JSON.stringify(expectedBuildReceipts.get(build.id).mapping_snapshot_digest) &&
  JSON.stringify(build.details.mapping_snapshot_upgrade_reason) ===
    JSON.stringify(expectedBuildReceipts.get(build.id).mapping_snapshot_upgrade_reason) &&
  JSON.stringify(build.details.mapping_snapshot_upgrade_proof) ===
    JSON.stringify(expectedBuildReceipts.get(build.id).mapping_snapshot_upgrade_proof);
for (const build of authorizedAfter.filter(value => authorizedBuildIds.has(value.id))) {
  assert.ok(exactReceiptMatches(build), `exact ${build.id} Harrison receipt must pass`);
  for (const field of [
    "mapping_snapshot_digest", "mapping_snapshot_upgrade_reason",
    "mapping_snapshot_upgrade_proof",
  ]) {
    const wrong = structuredClone(build);
    wrong.details[field] = field === "mapping_snapshot_upgrade_proof"
      ? { ...wrong.details[field], membership_count: -1 }
      : "wrong";
    assert.ok(!exactReceiptMatches(wrong), `wrong ${field} must fail exact receipt proof`);
  }
}
const normalizeAuthorizedRoadOutcome = road => {
  const normalized = structuredClone(road);
  delete normalized.geometry_checked_at;
  delete normalized.updated_at;
  return md5(Buffer.from(JSON.stringify(normalized)));
};
const repairedRoad = {
  id: 'f0db4fa8-3900-4350-a31e-3d61128006f8',
  name: 'CR-14',
  source_record_id: 'CHASCR00014**C|route:CR:14',
  verification_status: 'verified',
  geometry_checked_at: 'install-time',
  updated_at: 'install-time',
};
const laterTimestampOnly = { ...repairedRoad,
  geometry_checked_at: 'later-time', updated_at: 'later-time' };
assert.equal(normalizeAuthorizedRoadOutcome(laterTimestampOnly),
  normalizeAuthorizedRoadOutcome(repairedRoad),
  'authorized timestamp serialization must not create a false delta');
assert.notEqual(normalizeAuthorizedRoadOutcome({ ...repairedRoad, name: 'unexpected' }),
  normalizeAuthorizedRoadOutcome(repairedRoad),
  'an unrelated field mutation on an authorized target road must fail');

const protectedBefore = {
  non_target_roads: [{ id: "road-other", status: "verified" }],
  mappings: [{ id: "mapping", status: "verified" }],
  builds: syntheticBefore,
  migration_history_except_harrison: [{ version: "other", digest: "same" }],
  candidates: [{ id: "candidate", status: "held" }],
  occurrence_receipts: [{ id: "occurrence", status: "resolved" }],
  route_receipts: [{ id: "route", status: "needs_review" }],
  transition_receipts: [{ id: "transition", status: "resolved" }],
  geometry_receipts: [{ id: "geometry", status: "resolved" }],
  private_google_receipts: [{ id: "private-google", status: "held" }],
  public_google_routes: [],
  junctions: [{ id: "junction", digest: "same" }],
  memberships: [{ id: "membership", road_id: null }],
  anchors: [{ id: "anchor", digest: "same" }],
  source_scopes: [{ id: "OH" }, { id: "WV" }, { id: "PA" }],
  release_state: { cutover: false },
  saved_road_reconciliation_runs: [],
};
const protectedDigest = state => md5(Buffer.from(JSON.stringify({
  ...state,
  builds: state.builds.map(normalizeBuild).sort((a, b) => a.id.localeCompare(b.id)),
})));
const protectedAfter = structuredClone(protectedBefore);
protectedAfter.builds = authorizedAfter;
assert.equal(protectedDigest(protectedAfter), protectedDigest(protectedBefore),
  "exact authorized Harrison delta must preserve every broad invariant");
for (const [label, mutate] of [
  ["unrelated Road Manager road", state => { state.non_target_roads[0].status = "changed"; }],
  ["road mapping", state => { state.mappings.push({ id: "extra" }); }],
  ["extra migration history", state => { state.migration_history_except_harrison.push({ version: "extra" }); }],
  ["occurrence candidate", state => { state.candidates[0].status = "changed"; }],
  ["occurrence receipt", state => { state.occurrence_receipts[0].status = "changed"; }],
  ["route receipt", state => { state.route_receipts[0].status = "changed"; }],
  ["transition receipt", state => { state.transition_receipts[0].status = "changed"; }],
  ["geometry receipt", state => { state.geometry_receipts[0].status = "changed"; }],
  ["private Google receipt", state => { state.private_google_receipts[0].status = "changed"; }],
  ["public Google row", state => { state.public_google_routes.push({ id: "leak" }); }],
  ["junction", state => { state.junctions[0].digest = "changed"; }],
  ["membership", state => { state.memberships[0].road_id = "changed"; }],
  ["anchor", state => { state.anchors[0].digest = "changed"; }],
  ["source scope/WV-PA drift", state => { state.source_scopes[1].id = "changed"; }],
  ["cutover", state => { state.release_state.cutover = true; }],
  ["reconciliation", state => { state.saved_road_reconciliation_runs.push({ id: "run" }); }],
]) {
  const changed = structuredClone(protectedAfter);
  mutate(changed);
  assert.notEqual(protectedDigest(changed), protectedDigest(protectedBefore),
    `${label} mutation must fail expected-delta equality`);
}
const historyMatches = row => row.version === "20260817144432" &&
  row.name === "issue97_harrison_har_has_wrong_geometry_repair" &&
  row.statement_count === 1 && row.sql_md5 === "868651aec0e70afd0e1e635f638c9138";
assert.ok(historyMatches({ version: "20260817144432",
  name: "issue97_harrison_har_has_wrong_geometry_repair", statement_count: 1,
  sql_md5: "868651aec0e70afd0e1e635f638c9138" }));
assert.ok(!historyMatches({ version: "20260817144432",
  name: "issue97_harrison_har_has_wrong_geometry_repair", statement_count: 1,
  sql_md5: "wrong" }), "wrong Harrison migration SQL digest must fail");
assert.ok(!installer.includes("refresh_occurrence_candidate") &&
  !installer.includes("reconcile_route_corpus") &&
  !installer.includes("refresh_google_route"),
"installer must not expose route refresh/reconciliation/publication");
assert.ok(rehearsal.includes("rollback;"), "rehearsal must end in rollback");
assert.ok(!rehearsal.includes("commit;"), "rehearsal must contain zero COMMIT");

console.log(JSON.stringify({
  issue: 97,
  migrationCanonicalBytes: migrationEvidence.bytes,
  migrationCanonicalMd5: migrationEvidence.md5,
  failedWrappedMd5: md5(failedStored),
  result: "pass",
}));
