import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const root = dirname(scriptDirectory);
const rollout = join(root, "ops", "issue97-computer-rollout");
const migrationDirectory = join(root, "supabase", "migrations");
const archiveDirectory = join(rollout, "unapplied-migration-sources");

const ledger = JSON.parse(
  await readFile(join(rollout, "production-migration-ledger-20260824.json"), "utf8"),
);

assert.equal(ledger.issue, 97);
assert.equal(ledger.row_count, 121);
assert.equal(ledger.migrations.length, ledger.row_count);

const expectedVersions = ledger.migrations.map(({ version }) => version);
assert.equal(new Set(expectedVersions).size, expectedVersions.length);

const localFiles = (await readdir(migrationDirectory))
  .filter((name) => /^\d+_issue97_.+\.sql$/.test(name))
  .sort();
const localVersions = localFiles.map((name) => name.slice(0, name.indexOf("_")));

assert.equal(localFiles.length, ledger.row_count);
assert.deepEqual(localVersions.sort(), [...expectedVersions].sort());
assert.equal(new Set(localVersions).size, localVersions.length);

for (const version of ["20260813013246", "20260813013648", "20260823032513"]) {
  const ledgerRow = ledger.migrations.find((migration) => migration.version === version);
  const localName = localFiles.find((name) => name.startsWith(`${version}_`));
  assert.ok(ledgerRow);
  assert.ok(localName);
  const sql = (await readFile(join(migrationDirectory, localName), "utf8"))
    .replace(/\r\n?/g, "\n")
    .replace(/[\r\n]+$/, "");
  const digest = createHash("md5").update(sql).digest("hex");
  assert.equal(digest, ledgerRow.statement_trimmed_md5);
}

const placeholders = [
  "20260812025535_issue97_oh_supplemental_overlap_endpoint_projection_ledger_placeholder.sql",
  "20260812025631_issue97_supplemental_scope_indexes_ledger_placeholder.sql",
];
for (const name of placeholders) {
  const sql = await readFile(join(migrationDirectory, name), "utf8");
  assert.match(sql, /intentionally performs no database mutation/);
  assert.match(sql, /^select 1;\s*$/m);
}

const expectedArchived = [
  "20260811248000_issue97_oh_supplemental_name_event_performance.sql",
  "20260812037300_issue97_verified_run_provenance_hardening.sql",
  "20260812037400_issue97_transition_google_current_schema.sql",
  "20260812037500_issue97_transition_google_ingress_identity.sql",
  "20260812037600_issue97_transition_google_identity_first_source_lookup.sql",
  "20260812044200_issue97_oh_graph_registry_digest_performance.sql",
  "20260812044300_issue97_oh_graph_disable_jit.sql",
  "20260812045900_issue97_graph_name_change_endpoint_materialization.sql",
].sort();
const archived = (await readdir(archiveDirectory)).filter((name) => name.endsWith(".sql")).sort();
assert.deepEqual(archived, expectedArchived);

for (const name of archived) {
  assert.equal(localFiles.includes(basename(name)), false);
}

console.log(
  JSON.stringify({
    result: "PASS",
    issue: 97,
    productionLedgerVersions: expectedVersions.length,
    localMigrationVersions: localVersions.length,
    archivedUninstalledSources: archived.length,
    productionWrite: false,
  }),
);
