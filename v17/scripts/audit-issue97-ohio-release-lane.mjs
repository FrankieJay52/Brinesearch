import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const need = (source, token, label = token) =>
  assert.ok(source.includes(token), `Issue #97 Ohio release audit missing ${label}`);
const forbid = (source, token, label = token) =>
  assert.ok(!source.includes(token), `Issue #97 Ohio release audit forbids ${label}`);

const shell = read("ops/issue97-computer-rollout/issue97-release-rollout.sh");
const plan = read("ops/issue97-computer-rollout/sql/24-ohio-release-dark-plan.sql");
const gate = read("ops/issue97-computer-rollout/sql/25-ohio-canary-complete-gate.sql");

for (const token of [
  "ohio-canary",
  "plan-ohio-dark",
  "build-pending-ohio-dark",
  "Ohio canary: OH NOB semantic topology canary",
  "21-verify-nob-leonard-release.sql",
  "25-ohio-canary-complete-gate.sql",
  "24-ohio-release-dark-plan.sql",
  "grep -E '^OH\\|[A-Z]{3}$'",
  "non-Ohio scope leaked into Ohio batch",
  "Noble canary unexpectedly remained in post-canary Ohio plan",
  "No WV/PA build, activation, cutover, route publication or retry occurred.",
  "whole-Ohio independent read-only audit",
  "mixed-state release command disabled during Ohio-first phase",
]) need(shell, token, `Ohio-first shell ${token}`);

for (const forbidden of [
  "build_release_scope PA WAS",
  "build_release_scope WV ",
  "activate_graph_build",
  "activate_cutover",
  "refresh_google_routes",
  "xargs -P",
  "parallel ",
  "| tee ",
]) forbid(shell, forbidden, `Ohio-first shell expansion ${forbidden}`);

for (const source of [plan,gate]) {
  need(source, "begin read only", "read-only transaction");
  need(source, "set local statement_timeout='2min'", "bounded read-only timeout");
  for (const forbidden of [
    "insert into public.",
    "update public.",
    "delete from public.",
    "brinesearch_issue97_activate_graph_build",
    "brinesearch_issue97_activate_cutover",
    "brinesearch_issue97_refresh_google_routes",
  ]) forbid(source.toLowerCase(), forbidden, `Ohio release SQL mutation ${forbidden}`);
}

for (const token of [
  "state_code='OH'",
  "v_oh_count<>19",
  "v_scope_count<>38",
  "brinesearch_issue97_dataset_scope_current",
  "brinesearch_issue97_graph_build_release_current",
  "case when c.county_code='NOB' then 0 else 1 end",
]) need(plan, token, `Ohio plan ${token}`);
for (const forbidden of ["state_code='WV'","state_code='PA'"]) forbid(plan, forbidden, `non-Ohio plan token ${forbidden}`);

for (const token of [
  "state_code='OH' and b.county_code='NOB'",
  "b.status='validated'",
  "b.activated_at is null",
  "brinesearch_issue97_graph_build_release_current",
  "v_nob<>1",
]) need(gate, token, `Noble canary gate ${token}`);

console.log("Issue #97 Ohio-first Noble-canary + unattended serial fail-stop batch audit passed.");
