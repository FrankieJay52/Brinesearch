import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const installer = read("ops/issue97-computer-rollout/issue97-directional-highway-install.sh");
const regression = read("supabase/tests/issue97_directional_highway_installer_assembly.sh");
const pkg = JSON.parse(read("package.json"));

for (const token of [
  'installer_library_blob="a3d80f9d3812b1b11f37b7ea033ac77eaf916e5b"',
  'migration_version="20260817030000"',
  'migration_name="issue97_exact_directional_highway_designation_candidates"',
  'migration_blob="c10b729c6299111d31cfab79cbe1c46933441b7b"',
  'migration_md5="8c6455d70694fd91784b60cd164cfadf"',
  "72c16f75efdb356dc2b6d15c691e944c",
  "0f139df2a01f68722958ff10f1dd6f49",
  "PGSERVICE must be brinesearch_issue97_prod",
  "PGPASSWORD must not be set",
  "local HEAD ${local_head} does not equal fetched origin head ${remote_head}",
  "the one install attempt was already consumed",
  "2026-08-17 06:41:25.563805+00",
  "cardinality(statements)=1",
  "Protected before/after snapshots match exactly.",
  "Fresh one-shot server status after failed/ambiguous client result (NO RETRY)",
]) assert.ok(installer.includes(token), `Directional installer missing ${token}`);

assert.equal((installer.match(/run_psql --file=/g) ?? []).length, 1,
  "Directional installer must have exactly one migration client attempt");
assert.ok(installer.indexOf('>"${attempt_file}"') < installer.indexOf("run_psql --file="),
  "Attempt sentinel must precede the only client attempt");
for (const forbidden of [
  "supabase db push", "delete from supabase_migrations.schema_migrations",
  "brinesearch_issue97_refresh_google_route_transition", "brinesearch_issue97_activate",
]) assert.ok(!installer.includes(forbidden), `Directional installer contains forbidden ${forbidden}`);
assert.ok(!/\b(?:select|perform)\s+(?:public\.)?brinesearch_issue97_(?:run_all_pad_routing_pipeline|reconcile_route_corpus)\s*\(/i.test(installer),
  "Directional installer must not invoke reconciliation or the all-pad pipeline");

const rendered = spawnSync("bash", ["-lc",
  "source ops/issue97-computer-rollout/issue97-directional-highway-install.sh; render_install_sql",
], { cwd: root, encoding: "utf8" });
assert.equal(rendered.status, 0, `Directional installer render failed: ${rendered.stderr}`);
assert.ok(rendered.stdout.includes("ARRAY[$issue97_migration_20260817030000$"));
assert.ok(rendered.stdout.includes("$issue97_migration_20260817030000$]::text[]"));
assert.equal((rendered.stdout.match(/insert into supabase_migrations\.schema_migrations/g) ?? []).length, 1);
assert.equal(rendered.stdout.trimEnd().endsWith("commit;"), true);

for (const token of [
  "render_install_sql >\"${rendered}\"", "sed '$s/^commit;$/rollback;/'",
  "--file=\"${rollback_sql}\"", "migration_rows", "candidate_md5",
  "latest_receipt", "public_google", "cutover",
]) assert.ok(regression.includes(token), `Directional installer regression missing ${token}`);
assert.equal((regression.match(/--file="\$\{rollback_sql\}"/g) ?? []).length, 1);

assert.ok(pkg.scripts["verify:issue97-computer-rollout"].includes(
  "audit-issue97-directional-highway-installer.mjs"));
console.log("Issue #97 exact directional-highway installer audit passed.");
