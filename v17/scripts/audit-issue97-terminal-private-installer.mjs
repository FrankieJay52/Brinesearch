import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const installer = read(
  "ops/issue97-computer-rollout/issue97-terminal-private-access-install.sh",
);
const pkg = JSON.parse(read("package.json"));

const includesAll = (source, tokens, label) => {
  for (const token of tokens) assert.ok(source.includes(token), `${label} missing: ${token}`);
};

includesAll(installer, [
  "set -euo pipefail",
  'expected_branch="data/issue-97-authoritative-road-junction-graph"',
  'migration_file="supabase/migrations/20260817020000_issue97_terminal_private_access_path_isolation.sql"',
  'migration_version="20260817020000"',
  'migration_name="issue97_terminal_private_access_path_isolation"',
  'migration_blob="137b2b62a4419dab923d6782ecfc4ba9eec9e70a"',
  'migration_md5="6bf6791912a3423ba28379efe681ba47"',
  "PGSERVICE must be brinesearch_issue97_prod",
  "PGPASSWORD must not be set",
  "DATABASE_URL SUPABASE_DB_URL SUPABASE_DATABASE_URL",
  "local HEAD ${local_head} does not equal fetched origin head ${remote_head}",
  "the one install attempt was already consumed",
  "begin read only; set local statement_timeout='15min'; set local lock_timeout='2min'",
  "brinesearch:issue97:ohio-state-release",
  "brinesearch:issue97:all-pad-routing-pipeline",
  "brinesearch:issue97:route-corpus",
  "brinesearch:issue97:saved-road-reconciliation",
  "brinesearch:issue97:mapping-refresh",
  "insert into supabase_migrations.schema_migrations(version,statements,name)",
  "cardinality(statements)=1",
  "pg_catalog.md5(statements[1])='6bf6791912a3423ba28379efe681ba47'",
  "34bdc93597f6da3cad68376ca01906c1",
  "72c16f75efdb356dc2b6d15c691e944c",
  "8ad311611cf361ca457e4084128b9cfb",
  "Protected before/after snapshots match exactly.",
  "Fresh one-shot server status after failed/ambiguous client result (NO RETRY)",
], "Issue #97 terminal private-access installer");
assert.equal((installer.match(/statement_timeout='15min'/g) ?? []).length >= 4, true,
  "Guard, install, snapshot, and independent postflight paths must remain finitely bounded");

assert.equal((installer.match(/run_psql --file=/g) ?? []).length, 1,
  "Installer must have exactly one migration psql attempt");
assert.equal((installer.match(/insert into supabase_migrations\.schema_migrations/g) ?? []).length, 1,
  "Installer must have exactly one migration-history insertion");
assert.ok(installer.indexOf("printf 'begin;") < installer.indexOf("sed 's/\\r$//' \"${repo_root}/${migration_file}\"") &&
  installer.indexOf("sed 's/\\r$//' \"${repo_root}/${migration_file}\"") <
    installer.indexOf("insert into supabase_migrations.schema_migrations") &&
  installer.indexOf("insert into supabase_migrations.schema_migrations") < installer.indexOf("printf '%s\\ncommit;\\n'"),
"Migration SQL, exact history row, postflight, and COMMIT must share one generated transaction");
assert.ok(installer.includes("printf '$%s$]::text[]"),
  "Closing migration-history dollar delimiter must be literal psql SQL");
assert.ok(!installer.includes("printf '\\$%s\\$]::text[]"),
  "Installer must not emit the invalid escaped psql meta-command delimiter");
assert.ok(installer.indexOf('>"${attempt_file}"') < installer.indexOf("run_psql --file="),
  "Attempt sentinel must be written before the only migration client invocation");

for (const forbidden of [
  "supabase db push",
  "delete from supabase_migrations.schema_migrations",
  "update supabase_migrations.schema_migrations",
  "brinesearch_issue97_refresh_google_route_transition_dark(",
  "brinesearch_issue97_refresh_google_route_transition(",
  "brinesearch_issue97_activate",
]) assert.ok(!installer.includes(forbidden), `Installer contains forbidden operation: ${forbidden}`);
assert.ok(!/\b(?:select|perform)\s+(?:public\.)?brinesearch_issue97_(?:reconcile_route_corpus|run_all_pad_routing_pipeline)/i.test(installer),
  "Installer must not invoke reconciliation or the all-pad routing pipeline");

assert.ok(pkg.scripts["verify:issue97-computer-rollout"].includes(
  "audit-issue97-terminal-private-installer.mjs",
), "Terminal installer audit is not wired into the rollout verification lane");
assert.ok(pkg.scripts.build.includes("npm run verify:issue97-computer-rollout"),
  "Rollout verification lane is not wired into the full build");

console.log("Issue #97 terminal private-access exact-one installer audit passed.");
