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
  "ohio_source_scopes",
  "release_state",
  "saved_road_reconciliation_runs",
  "exact normalized ten-road outcomes drifted",
  "pg_catalog.to_jsonb(road)-'geometry_checked_at'-'updated_at'",
  "expected-delta protected invariants",
]) assert.ok(installer.includes(token), `installer missing expected-delta invariant: ${token}`);
assert.ok(!installer.includes("protected_snapshot_sql"),
  "installer must not retain the false whole-database snapshot comparison");

const authorizedBuildIds = new Set([
  "5ee5f97b-447f-41d3-946a-68a8b28d8367",
  "542c35d5-a9ba-4b43-8a64-63a66f6b29e2",
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
  { id: [...authorizedBuildIds][0], graph_digest: "graph-a", details: {
    mapping_snapshot_digest: "old", stable: "same",
  } },
  { id: "00000000-0000-0000-0000-000000000001", graph_digest: "graph-b",
    details: { mapping_snapshot_digest: "non-target", stable: "same" } },
];
const authorizedAfter = structuredClone(syntheticBefore);
authorizedAfter[0].details.mapping_snapshot_digest = "new";
authorizedAfter[0].details.mapping_snapshot_upgrade_reason =
  "harrison_har_to_has_wrong_geometry_repair";
authorizedAfter[0].details.mapping_snapshot_upgrade_proof = { topology_changed: false };
assert.equal(invariantDigest(authorizedAfter), invariantDigest(syntheticBefore),
  "only the authorized CAR/HAS mapping receipt fields may be excluded");
const topologyMutation = structuredClone(authorizedAfter);
topologyMutation[0].graph_digest = "changed-graph";
assert.notEqual(invariantDigest(topologyMutation), invariantDigest(syntheticBefore),
  "an authorized build topology mutation must fail expected-delta equality");
const unrelatedMutation = structuredClone(authorizedAfter);
unrelatedMutation[1].details.mapping_snapshot_digest = "changed-unrelated";
assert.notEqual(invariantDigest(unrelatedMutation), invariantDigest(syntheticBefore),
  "an unrelated build mutation must fail expected-delta equality");
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
