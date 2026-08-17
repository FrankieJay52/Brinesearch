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
