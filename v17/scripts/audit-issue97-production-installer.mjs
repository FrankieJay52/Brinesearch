import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const need = (source, token, label = token) =>
  assert.ok(source.includes(token), `Issue #97 production installer audit missing ${label}`);
const forbid = (source, token, label = token) =>
  assert.ok(!source.includes(token), `Issue #97 production installer audit forbids ${label}`);
const count = (source, token) => source.split(token).length - 1;

const installerPath = path.join(root, "ops/issue97-computer-rollout/issue97-release-install-final.sh");
const rehearsalPath = path.join(root, "ops/issue97-computer-rollout/issue97-release-rehearsal-final.sh");
const installer = fs.readFileSync(installerPath, "utf8");
const rehearsal = fs.readFileSync(rehearsalPath, "utf8");

execFileSync("bash", ["-n", installerPath], { stdio: "pipe" });

const migrationPattern = /"(supabase\/migrations\/20260814[^"\n]+\.sql)"/g;
const installerMigrations = [...installer.matchAll(migrationPattern)].map(match => match[1]);
const rehearsalMigrations = [...rehearsal.matchAll(migrationPattern)].map(match => match[1]);

assert.equal(installerMigrations.length, 22, "Issue #97 production installer must list exactly 22 migration files");
assert.equal(rehearsalMigrations.length, 22, "Issue #97 canonical rehearsal must still list exactly 22 migration files");
assert.deepEqual(
  installerMigrations,
  rehearsalMigrations,
  "Issue #97 production installer allowlist must exactly equal the successfully rehearsed 22-file order",
);

for (const token of [
  "CONTROLLED FINAL #97 PRODUCTION INSTALLER",
  "final production installer accepts no arguments",
  "expected exactly 22 final release migrations",
  "expected exactly 22 final release migration versions",
  "GPS binding must immediately follow the 16,118 baseline",
  "git -C \"${repo_root}\" fetch --quiet origin \"${expected_branch}\"",
  "local HEAD ${local_head} does not equal fetched origin head ${remote_head}",
  "set PGSERVICE to the private direct/session libpq service name",
  "do not use PGPASSWORD; keep the password in .pgpass/keychain",
  "export PGSSLMODE=\"require\"",
  "brinesearch-issue97-final-release-install",
  "c5d54a4d839df79eff99f4dfd4b0b780",
  "e0528f257f3c1b6d40341b735f284f1d",
  "final installer refuses a partial/already-installed 22-version release chain",
  "final release-generation table already exists before exact install",
  "Ohio 38/38 source-current",
  "set local statement_timeout='15min'",
  "set local lock_timeout='2min'",
  "sed 's/\\r$//'",
  "insert into supabase_migrations.schema_migrations(version,statements,name)",
  "ARRAY[\\$%s\\$",
  "Record the exact normalized SQL that was just executed",
  "same transaction as the migration itself",
  "printf 'commit;\\n'",
  "protected_before",
  "protected_after",
  "protected graph/route/cutover state changed during final release install",
  "Fresh one-shot server status (NO RETRY)",
  "do not retry until the fresh server state is reviewed",
  "install client returned success but fresh protected after-snapshot could not be captured",
  "final release install committed but fresh postflight failed; stop before canaries",
  "PASS: exact 22/22 final #97 release migrations installed atomically",
]) need(installer, token, token);

assert.equal(count(installer, "printf 'begin;\\n'"), 1, "Issue #97 production installer must assemble exactly one outer BEGIN");
assert.equal(count(installer, "printf 'commit;\\n'"), 1, "Issue #97 production installer must assemble exactly one outer COMMIT");
assert.ok(
  installer.indexOf("sed 's/\\r$//' \"${repo_root}/${file}\"") <
    installer.indexOf("insert into supabase_migrations.schema_migrations(version,statements,name)"),
  "Issue #97 migration SQL must be emitted before its same-transaction history row",
);
assert.ok(
  installer.indexOf("run_psql --file=\"${sql_file}\"") <
    installer.indexOf("protected_after=\"$(run_psql"),
  "Issue #97 installer must perform fresh post-commit verification only after the installing client returns",
);

for (const forbidden of [
  "supabase db push",
  "supabase migration up",
  "supabase migration repair",
  "apply_migration",
  "PGPASSWORD=",
  "DATABASE_URL=",
  "activate_graph_build(",
  "activate_cutover(",
  "refresh_google_routes(",
  "build-pending-ohio-dark",
  "ohio-canary",
]) forbid(installer, forbidden, `unsafe installer surface ${forbidden}`);

// The installer records history only by executing the exact migration and then
// inserting its matching version/name/full normalized SQL in the same outer
// transaction. It must never expose a separate history-only repair path.
assert.equal(
  count(installer, "insert into supabase_migrations.schema_migrations(version,statements,name)"),
  1,
  "Issue #97 installer must have one templated same-transaction migration-history insertion site",
);
forbid(installer, "on conflict", "history-only conflict suppression");
forbid(installer, "delete from supabase_migrations.schema_migrations", "migration-history deletion");
forbid(installer, "update supabase_migrations.schema_migrations", "migration-history rewrite");

console.log(
  "Issue #97 production installer audit passed: the installer is a no-argument PGSERVICE-only lane, its exact ordered 22-file allowlist equals the canonical successful rehearsal, migration SQL and matching history rows share one outer transaction, protected graph/route/cutover state is compared across a fresh connection, failures are no-retry with one server-state inspection, and no activation/cutover/publish or broad Supabase migration command is reachable.",
);
