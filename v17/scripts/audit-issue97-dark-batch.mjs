import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const shell = read("ops/issue97-computer-rollout/issue97-computer-rollout.sh");
const plan = read("ops/issue97-computer-rollout/sql/14-dark-build-plan.sql");
const light = read("ops/issue97-computer-rollout/sql/15-verify-county-light.sql");
const build = read("ops/issue97-computer-rollout/sql/10-build-county.sql");
const readme = read("ops/issue97-computer-rollout/README.md");
const pkg = JSON.parse(read("package.json"));

const need = (source, token, label = token) =>
  assert.ok(source.includes(token), `Issue #97 dark-batch audit missing ${label}`);
const forbid = (source, token, label = token) =>
  assert.ok(!source.includes(token), `Issue #97 dark-batch audit forbids ${label}`);

for (const token of [
  "plan-dark",
  "build-pending-dark",
  "14-dark-build-plan.sql",
  "15-verify-county-light.sql",
  "Pending dark-build plan:",
  "Serial, fail-stop, no activation.",
  "sleep 5",
  "no retry will occur",
  "OH:BEL|OH:JEF|OH:NOB",
  "mirror_log()",
  "rc=${PIPESTATUS[0]}",
]) need(shell, token);
forbid(shell, "| tee ", "external tee logging dependency");

const batchStart = shell.indexOf("build-pending-dark)");
assert.ok(batchStart >= 0, "dark batch command must exist");
const batchEnd = shell.indexOf("\n      ;;", batchStart);
assert.ok(batchEnd > batchStart, "dark batch command must have a bounded case arm");
const batch = shell.slice(batchStart, batchEnd);

for (const token of [
  "build_scope_dark",
  "light",
  "sleep 5",
  "Stop here for one checkpoint-wide independent read-only audit before activation work.",
]) need(batch, token);

for (const token of [
  "10-build-county.sql",
  "15-verify-county-light.sql",
]) need(shell, token, `dark-build helper ${token}`);

for (const token of [
  "11-verify-county.sql",
  "activate_graph_build",
  "activate_cutover",
  "refresh_google_routes",
  "directions-dark",
  "xargs -P",
  "parallel ",
]) forbid(batch, token, `dark batch semantic expansion ${token}`);

for (const source of [plan, light]) {
  need(source, "begin read only", "read-only transaction");
  need(source, "set local statement_timeout='2min'", "bounded read-only timeout");
  for (const token of [
    "brinesearch_issue97_activate_graph_build",
    "brinesearch_issue97_activate_cutover",
    "brinesearch_issue97_refresh_google_routes",
    "update public.",
    "insert into public.",
    "delete from public.",
  ]) forbid(source, token, `read-only batch SQL mutation ${token}`);
}

for (const token of [
  "'OH:BEL','OH:JEF','OH:NOB'",
  "source_run_vector",
  "mapping_snapshot_digest",
  "brinesearch_issue97_graph_mapping_evidence",
  "mapping.mapping_status='verified'",
  "build.status in ('active','validated')",
  "build.status='staging'",
  "state_code='PA' and county_code='WAS'",
]) need(plan, token, `dark-build plan ${token}`);

for (const token of [
  "build.status='validated'",
  "build.activated_at is null",
  "brinesearch_issue97_graph_build_sources_current(candidate.id)",
  "junction.stable_junction_key||':'||junction.graph_digest",
  "candidate.point_junction_count",
  "candidate.shared_segment_count",
  "candidate.membership_count",
  "candidate.details->>'held_junction_count'",
  "brinesearch_road_junction_anchors",
  "brinesearch_issue97_cutover_active()",
  "staging.status='staging'",
  "Issue #97 lightweight county dark-build verification failed",
]) need(light, token, `light verifier ${token}`);

assert.equal(
  (build.match(/public\.brinesearch_issue97_rebuild_county_graph\(/g) || []).length,
  1,
  "existing county build primitive must still call the builder exactly once"
);

for (const token of [
  "does **not** need to start and approve each remaining county",
  "runs **serially**, never in parallel",
  "stops on the first error",
  "never activates a graph",
  "checkpoint-wide independent read-only audit",
]) need(readme, token, `README batch contract ${token}`);

assert.equal(
  pkg.scripts["verify:issue97-dark-batch"],
  "node v17/scripts/audit-issue97-dark-batch.mjs",
  "dark-batch audit must be directly runnable"
);
assert.ok(
  pkg.scripts.build.includes("npm run verify:issue97-dark-batch"),
  "dark-batch audit must run in the full build"
);

console.log("Issue #97 fail-stop serial dark-batch audit passed.");
